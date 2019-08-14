pragma solidity 0.5.10;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../IValidatorRegistration.sol";
import "../access/Operators.sol";
import "../Deposits.sol";
import "../Settings.sol";
import "../ValidatorsRegistry.sol";
import "./BaseCollector.sol";

/**
 * @title Pools
 * Pools contract collects deposits from anyone.
 * It accumulates deposits, distributes them among pools and registers as validators.
 * All the deposits of the pool which hasn't accumulated validator deposit amount are cancelable.
 */
contract Pools is BaseCollector {
    /**
    * Event for tracking users' deposits added to the current pool.
    * @param poolId - ID of the pool deposit was added to.
    * @param sender - an account which has sent the deposit.
    * @param withdrawer - an account where deposit + rewards will be sent after withdrawal.
    * @param amount - amount deposited (in Wei).
    */
    event DepositAdded(
        bytes32 indexed poolId,
        address indexed sender,
        address indexed withdrawer,
        uint256 amount
    );

    /**
    * Event for tracking users' deposits removed from the current unfilled pool.
    * @param poolId - ID of the pool deposit was removed from.
    * @param sender - an account which has sent the deposit.
    * @param withdrawer - an account where deposit + rewards had to be sent after withdrawal.
    * @param amount - amount canceled (in Wei).
    */
    event DepositCanceled(
        bytes32 indexed poolId,
        address indexed sender,
        address indexed withdrawer,
        uint256 amount
    );

    /**
    * Constructor for initializing the Pools contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _operators - Address of the Operators contract.
    * @param _validatorRegistration - Address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    */
    function initialize(
        Deposits _deposits,
        Settings _settings,
        Operators _operators,
        IValidatorRegistration _validatorRegistration,
        ValidatorsRegistry _validatorsRegistry
    )
        public initializer
    {
        BaseCollector.initialize(
            _deposits,
            _settings,
            _operators,
            _validatorRegistration,
            _validatorsRegistry
        );
    }

    /**
    * Function for adding deposits to pools.
    * User must transfer ether amount together with calling the function.
    * The amount will be added to the unfilled pool.
    * If the transferred amount makes the current pool exceed `settings.validatorDepositAmount`,
    * it will be split between the current pool and the next one.
    * @param _withdrawer - an account where deposit + rewards will be sent after withdrawal.
    */
    function addDeposit(address _withdrawer) external payable {
        require(_withdrawer != address(0), "Withdraw address cannot be zero address.");
        require(msg.value > 0, "Deposit amount cannot be zero.");
        require(msg.value % settings.userDepositMinUnit() == 0, "Invalid deposit amount unit.");

        bytes32 userId;
        bytes32 poolId;
        uint256 toCollect;
        uint256 toProcess = msg.value;
        uint256 validatorTargetAmount = settings.validatorDepositAmount();
        do {
            poolId = keccak256(abi.encodePacked("pools", entityCounter));
            userId = keccak256(abi.encodePacked(poolId, msg.sender, _withdrawer));
            toCollect = validatorTargetAmount - (totalSupply % validatorTargetAmount);
            if (toProcess >= toCollect) {
                // Deposit has filled up current pool
                deposits.increaseAmount(userId, toCollect);
                totalSupply += toCollect;
                toProcess -= toCollect;
                emit DepositAdded(poolId, msg.sender, _withdrawer, toCollect);

                // It was the last deposit for the current pool, increase the counter
                // XXX: Causes additional gas usage
                readyEntities.push(poolId);
                entityCounter++;
            } else {
                // Deposit fits in current pool
                deposits.increaseAmount(userId, toProcess);
                totalSupply += toProcess;
                emit DepositAdded(poolId, msg.sender, _withdrawer, toProcess);
                break;
            }
        }
        while (toProcess != 0);
    }

    /**
    * Function for canceling deposits in current pool.
    * The deposits can only be canceled from the pool which has less than `settings.validatorDepositAmount`.
    * @param _withdrawer - an account where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - the amount of ether to cancel from the active pool.
    */
    function cancelDeposit(address payable _withdrawer, uint256 _amount) external {
        require(_amount > 0, "Cancel amount cannot be zero.");
        require(_amount % settings.userDepositMinUnit() == 0, "Invalid cancel amount unit.");

        bytes32 poolId = keccak256(abi.encodePacked("pools", entityCounter));
        bytes32 userId = keccak256(abi.encodePacked(poolId, msg.sender, _withdrawer));
        require(deposits.amounts(userId) >= _amount, "User does not have specified cancel amount.");

        deposits.decreaseAmount(userId, _amount);
        totalSupply -= _amount;
        emit DepositCanceled(poolId, msg.sender, _withdrawer, _amount);

        _withdrawer.transfer(_amount);
    }
}
