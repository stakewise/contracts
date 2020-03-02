pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../Deposits.sol";
import "../Settings.sol";
import "./BaseCollector.sol";

/**
 * @title Pools
 * Pools contract collects deposits from anyone.
 * It accumulates deposits, distributes them among pools and registers as validators.
 * All the deposits of the pool which hasn't accumulated validator deposit amount are cancelable.
 */
contract Pools is BaseCollector {
    /**
    * Constructor for initializing the Pools contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _operators - Address of the Operators contract.
    * @param _validatorRegistration - Address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _validatorTransfers - Address of the Validator Transfers contract.
    */
    function initialize(
        Deposits _deposits,
        Settings _settings,
        Operators _operators,
        IValidatorRegistration _validatorRegistration,
        ValidatorsRegistry _validatorsRegistry,
        ValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        BaseCollector.initialize(
            _deposits,
            _settings,
            _operators,
            _validatorRegistration,
            _validatorsRegistry,
            _validatorTransfers
        );
    }

    /**
    * Function for adding deposits to pools.
    * User must transfer ether amount together with calling the function.
    * The amount will be added to the unfilled pool.
    * If the transferred amount makes the current pool exceed `settings.validatorDepositAmount`,
    * it will be split between the current pool and the next one. If Pools collector is paused in `Settings` contract,
    * the maximum deposit size is the amount required to send current pool for staking.
    * @param _withdrawer - an account where deposit + rewards will be sent after the withdrawal.
    */
    function addDeposit(address _withdrawer) external payable {
        require(_withdrawer != address(0), "Withdrawer address cannot be zero address.");
        require(msg.value > 0 && msg.value % settings.userDepositMinUnit() == 0, "Invalid deposit amount.");

        uint256 validatorTargetAmount = settings.validatorDepositAmount();
        require(
            !settings.pausedCollectors(address(this)) ||
        (
            totalSupply % validatorTargetAmount != 0 &&
            msg.value <= validatorTargetAmount - (totalSupply % validatorTargetAmount)
        ),
            "Deposit amount cannot be larger than required to finish current pool."
        );
        uint256 toCollect;
        uint256 toProcess = msg.value;
        do {
            toCollect = validatorTargetAmount - (totalSupply % validatorTargetAmount);
            if (toProcess >= toCollect) {
                // Deposit has filled up current pool
                deposits.addDeposit(nextEntityId, msg.sender, _withdrawer, toCollect);
                totalSupply += toCollect;
                toProcess -= toCollect;

                // It was the last deposit for the current pool, increase the ID
                // XXX: Unfair for the last deposit as it causes additional gas usage
                readyEntities.push(nextEntityId);
                nextEntityId++;
            } else {
                // Deposit fits in current pool
                deposits.addDeposit(nextEntityId, msg.sender, _withdrawer, toProcess);
                totalSupply += toProcess;
                break;
            }
        } while (toProcess != 0);
    }

    /**
    * Function for canceling deposits in current pool.
    * The deposits can only be canceled from the pool which has less than `settings.validatorDepositAmount`.
    * @param _withdrawer - an account where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - the amount of ether to cancel from the active pool.
    */
    function cancelDeposit(address payable _withdrawer, uint256 _amount) external {
        require(_amount > 0 && _amount % settings.userDepositMinUnit() == 0, "Invalid deposit cancel amount.");
        require(
            deposits.getDeposit(address(this), nextEntityId, msg.sender, _withdrawer) >= _amount,
            "The user does not have a specified deposit cancel amount."
        );
        require(
            deposits.amounts(keccak256(abi.encodePacked(keccak256(abi.encodePacked(address(this), nextEntityId)), msg.sender, _withdrawer))) >= _amount,
            "User does not have specified cancel amount."
        );

        deposits.cancelDeposit(nextEntityId, msg.sender, _withdrawer, _amount);
        totalSupply -= _amount;

        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success,) = _withdrawer.call.value(_amount)("");
        // solhint-enable avoid-call-value
        require(success, "Transfer has failed.");
    }
}
