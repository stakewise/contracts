// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Counters.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IValidatorTransfers.sol";
import "../interfaces/IDeposits.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IManagers.sol";

/**
 * @title Pools
 *
 * @dev Pools contract collects deposits from any user.
 * It accumulates deposits, distributes them among pools and registers as validators.
 * The deposits are cancelable until new pool or validator is created.
 */
contract Pools is Initializable {
    using Address for address payable;
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    // @dev Maps pool ID to whether validator can be registered for it.
    mapping(bytes32 => bool) public pendingPools;

    // @dev Total amount collected for the new pool.
    uint256 public collectedAmount;

    // @dev Total number of pools created.
    Counters.Counter private poolsCounter;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Deposits contract.
    IDeposits private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Address of the Validator Transfers contract.
    IValidatorTransfers private validatorTransfers;

    /**
    * @dev Constructor for initializing the Pools contract.
    * @param _managers - address of the Managers contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
    */
    function initialize(
        IManagers _managers,
        IDeposits _deposits,
        ISettings _settings,
        IOperators _operators,
        IValidatorRegistration _validatorRegistration,
        IValidators _validators,
        IValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        managers = _managers;
        deposits = _deposits;
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validators = _validators;
        validatorTransfers = _validatorTransfers;
        poolsCounter.increment();
    }

    /**
    * @dev Function for getting pools counter.
    */
    function getCounter() external view returns (uint256) {
        return poolsCounter.current();
    }

    /**
    * @dev Function for adding deposits to pools. If added amount makes the current pool exceed validator deposit amount,
    * it will be split between the current pool and the next one. The depositing will be disallowed in case
    * `Pools` contract is paused in `Settings` contract.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function addDeposit(address _recipient) external payable {
        require(_recipient != address(0), "Invalid recipient address.");
        require(msg.value > 0 && (msg.value).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit amount.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        bytes32 poolId = keccak256(abi.encodePacked(address(this), poolsCounter.current()));
        uint256 validatorTargetAmount = settings.validatorDepositAmount();
        uint256 toCollect = validatorTargetAmount.sub(collectedAmount);
        if (msg.value > toCollect) {
            // the deposit is bigger than the amount required to collect
            uint256 toProcess = msg.value;
            do {
                deposits.addDeposit(poolId, msg.sender, _recipient, toCollect);
                toProcess = toProcess.sub(toCollect);

                // it was the last deposit for the current pool
                pendingPools[poolId] = true;

                // create new pool
                poolsCounter.increment();
                poolId = keccak256(abi.encodePacked(address(this), poolsCounter.current()));
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
            poolsCounter.increment();
            collectedAmount = 0;
        }
    }

    /**
    * @dev Function for canceling deposits in new pool.
    * The deposits are cancelable until new pool or validator is created.
    * @param _recipient - address where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - amount to cancel from the deposit.
    */
    function cancelDeposit(address payable _recipient, uint256 _amount) external {
        require(_amount > 0 && _amount.mod(settings.userDepositMinUnit()) == 0, "Invalid deposit cancel amount.");
        bytes32 poolId = keccak256(abi.encodePacked(address(this), poolsCounter.current()));
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
    * @dev Function for registering validators for the pools which are ready to start staking.
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

        // allow transfers for periodic pools
        if (settings.stakingDurations(address(this)) > 0) {
            validatorTransfers.allowTransfer(_poolId);
        }

        // cleanup pending pool
        delete pendingPools[_poolId];

        // register validator
        bytes memory withdrawalCredentials = settings.withdrawalCredentials();
        uint256 depositAmount = settings.validatorDepositAmount();
        validators.register(
            _pubKey,
            withdrawalCredentials,
            _poolId,
            depositAmount,
            settings.maintainerFee()
        );
        validatorRegistration.deposit{value: depositAmount}(
            _pubKey,
            withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * @dev Function for transferring validator ownership to the new pool.
    * @param _validatorId - ID of the validator to transfer.
    * @param _validatorReward - validator current reward.
    * @param _poolId - ID of the pool to register validator for.
    * @param _managerSignature - ECDSA signature of the previous entity manager if such exists.
    */
    function transferValidator(
        bytes32 _validatorId,
        uint256 _validatorReward,
        bytes32 _poolId,
        bytes calldata _managerSignature
    )
        external
    {
        require(pendingPools[_poolId], "Invalid pool ID.");
        require(operators.isOperator(msg.sender), "Permission denied.");

        (uint256 depositAmount, uint256 prevMaintainerFee, bytes32 prevEntityId,) = validators.validators(_validatorId);
        require(managers.canTransfer(prevEntityId, _managerSignature), "Invalid transfers manager signature.");
        require(validatorTransfers.checkTransferAllowed(prevEntityId), "Validator transfer is not allowed.");

        // calculate previous entity reward and fee
        (uint256 prevUserDebt, uint256 prevMaintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);
        uint256 prevEntityReward = _validatorReward.sub(prevUserDebt).sub(prevMaintainerDebt);
        uint256 maintainerDebt = (prevEntityReward.mul(prevMaintainerFee)).div(10000);

        // allow transfer for periodic pool
        if (settings.stakingDurations(address(this)) > 0) {
            validatorTransfers.allowTransfer(_poolId);
        }

        // clean up pending pool
        delete pendingPools[_poolId];

        // transfer validator to the new pool
        validators.update(_validatorId, _poolId, settings.maintainerFee());

        // register validator transfer
        validatorTransfers.registerTransfer{value: depositAmount}(
            _validatorId,
            prevEntityId,
            prevEntityReward.sub(maintainerDebt),
            maintainerDebt
        );
    }
}
