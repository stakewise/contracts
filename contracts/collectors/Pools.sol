pragma solidity 0.5.17;

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
    * it will be split between the current pool and the next one. If Pools contract is paused in `Settings` contract,
    * the maximum deposit size is the amount required to send current pool for staking.
    * @param _withdrawer - an account where deposit + rewards will be sent after the withdrawal.
    */
    function addDeposit(address _withdrawer) external payable {
        require(_withdrawer != address(0), "Withdrawer address cannot be zero address.");
        require(msg.value > 0 && (msg.value).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit amount.");

        uint256 validatorTargetAmount = settings.validatorDepositAmount();
        require(
            !settings.pausedContracts(address(this)) ||
        (
            totalSupply.mod(validatorTargetAmount) != 0 &&
            msg.value <= validatorTargetAmount.sub(totalSupply.mod(validatorTargetAmount))
        ),
            "Deposit amount cannot be larger than required to finish current pool."
        );
        uint256 toCollect;
        bytes32 entityId;
        uint256 toProcess = msg.value;
        do {
            entityId = keccak256(abi.encodePacked(address(this), entitiesCount));
            toCollect = validatorTargetAmount.sub(totalSupply.mod(validatorTargetAmount));
            if (toProcess >= toCollect) {
                // Deposit has filled up current pool
                deposits.addDeposit(entityId, msg.sender, _withdrawer, toCollect);
                totalSupply = totalSupply.add(toCollect);
                toProcess = toProcess.sub(toCollect);

                // It was the last deposit for the current pool, add entity ID to the queue
                readyEntityIds.push(entityId);
                entitiesCount++;
            } else {
                // Deposit fits in current pool
                deposits.addDeposit(entityId, msg.sender, _withdrawer, toProcess);
                totalSupply = totalSupply.add(toProcess);
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
        require(_amount > 0 && _amount.mod(settings.userDepositMinUnit()) == 0, "Invalid deposit cancel amount.");
        bytes32 poolId = keccak256(abi.encodePacked(address(this), entitiesCount));
        require(
            deposits.getDeposit(poolId, msg.sender, _withdrawer) >= _amount,
            "The user does not have a specified deposit cancel amount."
        );

        deposits.cancelDeposit(poolId, msg.sender, _withdrawer, _amount);
        totalSupply = totalSupply.sub(_amount);

        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success,) = _withdrawer.call.value(_amount)("");
        // solhint-enable avoid-call-value
        require(success, "Transfer has failed.");
    }
}
