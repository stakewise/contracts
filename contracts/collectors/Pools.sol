pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../validators/ValidatorTransfers.sol";
import "../Deposits.sol";
import "../Settings.sol";

/**
 * @title Pools
 * Pools contract collects deposits from any user.
 * It accumulates deposits, distributes them among pools and registers as validators.
 * The deposits are cancelable until new pool or validator is created.
 */
contract Pools is Initializable {
    using Address for address payable;
    using SafeMath for uint256;

    // maps pool ID to whether validator can be registered for it.
    mapping(bytes32 => bool) public pendingPools;

    // total amount collected for the new pool.
    uint256 public collectedAmount;

    // total number of pools created.
    uint256 public poolsCount;

    // address of the Deposits contract.
    Deposits private deposits;

    // address of the Settings contract.
    Settings private settings;

    // address of the Operators contract.
    Operators private operators;

    // address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // address of the Validators Registry contract.
    ValidatorsRegistry private validatorsRegistry;

    // address of the Validator Transfers contract.
    ValidatorTransfers private validatorTransfers;

    /**
    * Constructor for initializing the Pools contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - address of the Validators Registry contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
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
        deposits = _deposits;
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validatorsRegistry = _validatorsRegistry;
        validatorTransfers = _validatorTransfers;
        poolsCount = 1;
    }

    /**
    * Function for adding deposits to pools. If added amount makes the current pool exceed validator deposit amount,
    * it will be split between the current pool and the next one. If Pools contract is paused in `Settings` contract,
    * the maximum deposit size is the amount required to send the last pool for staking.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function addDeposit(address _recipient) external payable {
        require(_recipient != address(0), "Invalid recipient address.");
        require(msg.value > 0 && (msg.value).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit amount.");

        uint256 validatorTargetAmount = settings.validatorDepositAmount();
        uint256 toCollect = validatorTargetAmount.sub(collectedAmount);
        require(
            !settings.pausedContracts(address(this)) || (collectedAmount != 0 && msg.value <= toCollect),
            "Deposit amount cannot be larger than amount required to finish the last pool."
        );

        bytes32 poolId = keccak256(abi.encodePacked(address(this), poolsCount));
        if (msg.value > toCollect) {
            // the deposit is bigger than the amount required to collect
            uint256 toProcess = msg.value;
            do {
                deposits.addDeposit(poolId, msg.sender, _recipient, toCollect);
                toProcess = toProcess.sub(toCollect);

                // it was the last deposit for the current pool
                pendingPools[poolId] = true;

                // create new pool
                poolsCount++;
                poolId = keccak256(abi.encodePacked(address(this), poolsCount));
                toCollect = validatorTargetAmount;
            } while (toProcess > toCollect);
            deposits.addDeposit(poolId, msg.sender, _recipient, toProcess);
            collectedAmount = toProcess;
        } else {
            // deposit fits in the current pool
            deposits.addDeposit(poolId, msg.sender, _recipient, msg.value);
            collectedAmount = collectedAmount.add(msg.value);
        }

        if (collectedAmount == validatorTargetAmount) {
            pendingPools[poolId] = true;
            poolsCount++;
            collectedAmount = 0;
        }
    }

    /**
    * Function for canceling deposits in new pool.
    * The deposits are cancelable until new pool or validator is created.
    * @param _recipient - address where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - amount to cancel from the deposit.
    */
    function cancelDeposit(address payable _recipient, uint256 _amount) external {
        require(_amount > 0 && _amount.mod(settings.userDepositMinUnit()) == 0, "Invalid deposit cancel amount.");
        bytes32 poolId = keccak256(abi.encodePacked(address(this), poolsCount));
        require(
            deposits.getDeposit(poolId, msg.sender, _recipient) >= _amount,
            "The user does not have specified deposit cancel amount."
        );

        // cancel deposit
        deposits.cancelDeposit(poolId, msg.sender, _recipient, _amount);
        collectedAmount = collectedAmount.sub(_amount);

        // transfer canceled amount to the recipient
        _recipient.sendValue(_amount);
    }

    /**
    * Function for registering validators for the pools which are ready to start staking.
    * @param _pubKey - BLS public key of the validator, generated by the operator.
    * @param _signature - BLS signature of the validator, generated by the operator.
    * @param _depositDataRoot - hash tree root of the deposit data, generated by the operator.
    * @param _poolId - ID of the pool to register validator for.
    */
    function registerValidator(
        bytes calldata _pubKey,
        bytes calldata _signature,
        bytes32 _depositDataRoot,
        bytes32 _poolId
    )
        external
    {
        require(pendingPools[_poolId], "Invalid pool ID.");
        require(operators.isOperator(msg.sender), "Permission denied.");

        // cleanup pending pool
        delete pendingPools[_poolId];

        // register validator
        bytes memory withdrawalCredentials = settings.withdrawalCredentials();
        uint256 depositAmount = settings.validatorDepositAmount();
        validatorsRegistry.register(
            _pubKey,
            withdrawalCredentials,
            _poolId,
            depositAmount,
            settings.maintainerFee()
        );
        validatorRegistration.deposit.value(depositAmount)(
            _pubKey,
            withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * Function for transferring validator ownership to the new pool.
    * @param _validatorId - ID of the validator to transfer.
    * @param _validatorReward - validator current reward.
    * @param _poolId - ID of the pool to register validator for.
    */
    function transferValidator(
        bytes32 _validatorId,
        uint256 _validatorReward,
        bytes32 _poolId
    )
        external
    {
        require(pendingPools[_poolId], "Invalid pool ID.");
        require(operators.isOperator(msg.sender), "Permission denied.");

        (uint256 depositAmount, uint256 prevMaintainerFee, bytes32 prevEntityId) = validatorsRegistry.validators(_validatorId);
        require(prevEntityId != "", "Validator with such ID is not registered.");

        (uint256 prevUserDebt, uint256 prevMaintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);

        // transfer validator to the new pool
        delete pendingPools[_poolId];
        validatorsRegistry.update(_validatorId, _poolId, settings.maintainerFee());

        uint256 prevEntityReward = _validatorReward.sub(prevUserDebt).sub(prevMaintainerDebt);
        uint256 maintainerDebt = (prevEntityReward.mul(prevMaintainerFee)).div(10000);
        validatorTransfers.registerTransfer.value(depositAmount)(
            _validatorId,
            prevEntityId,
            prevEntityReward.sub(maintainerDebt),
            maintainerDebt
        );
    }
}
