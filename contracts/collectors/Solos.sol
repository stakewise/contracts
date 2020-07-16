// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Counters.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IManagers.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IValidatorTransfers.sol";
import "../interfaces/IDeposits.sol";

/**
 * @title Solos
 *
 * @dev Users can create standalone validators using this contract.
 * They can optionally provide their own withdrawal key. The validator can be registered as soon as deposit is added.
 */
contract Solos is Initializable {
    using Address for address payable;
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    /**
    * @dev Structure for storing information about the solo deposit which was not yet sent for staking.
    * @param amount - validator deposit amount.
    * @param withdrawalCredentials - withdrawal credentials of the validator.
    */
    struct Solo {
        uint256 amount;
        bytes withdrawalCredentials;
    }

    // @dev Maps ID of the pending solo deposit to its information.
    mapping(bytes32 => Solo) public pendingSolos;

    // @dev Total number of solos created.
    Counters.Counter private solosCounter;

    // @dev Address of the Deposits contract.
    IDeposits private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Address of the Validator Transfers contract.
    IValidatorTransfers private validatorTransfers;

    /**
    * @dev Event for tracking solo deposit own withdrawal public key.
    * @param entityId - ID of the solo deposit the key belongs to.
    * @param withdrawalPublicKey - BLS public key to use for the validator withdrawal, submitted by the deposit sender.
    * @param withdrawalCredentials - withdrawal credentials based on submitted BLS public key.
    */
    event WithdrawalKeyAdded(
        bytes32 indexed entityId,
        bytes withdrawalPublicKey,
        bytes withdrawalCredentials
    );

    /**
    * @dev Constructor for initializing the Solos contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _managers - address of the Managers contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
    */
    function initialize(
        IDeposits _deposits,
        ISettings _settings,
        IManagers _managers,
        IOperators _operators,
        IValidatorRegistration _validatorRegistration,
        IValidators _validators,
        IValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        deposits = _deposits;
        settings = _settings;
        managers = _managers;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validators = _validators;
        validatorTransfers = _validatorTransfers;
    }

    /**
    * @dev Function for adding solo deposits.
    * The deposit amount must be divisible by the validator deposit amount.
    * The depositing will be disallowed in case `Solos` contract is paused in `Settings` contract.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function addDeposit(address _recipient) external payable {
        require(_recipient != address(0), "Invalid recipient address.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        uint256 depositsCount = msg.value.div(validatorDepositAmount);
        require(msg.value.mod(validatorDepositAmount) == 0 && depositsCount > 0, "Invalid deposit amount.");

        do {
            // register new solo deposit
            solosCounter.increment();
            bytes32 soloId = keccak256(abi.encodePacked(address(this), solosCounter.current()));
            deposits.addDeposit(soloId, msg.sender, _recipient, validatorDepositAmount);

            Solo storage pendingSolo = pendingSolos[soloId];
            pendingSolo.amount = validatorDepositAmount;

            // register transfer manager
            managers.addTransferManager(soloId, msg.sender);

            depositsCount--;
        } while (depositsCount > 0);
    }

    /**
    * @dev Function for adding private solo deposits.
    * The deposit amount must be divisible by the validator deposit amount.
    * The depositing will be disallowed in case `Solos` contract is paused in `Settings` contract.
    * @param _publicKey - BLS public key for performing validator withdrawal.
    */
    function addPrivateDeposit(bytes calldata _publicKey) external payable {
        require(_publicKey.length == 48, "Invalid BLS withdrawal public key.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        uint256 depositsCount = msg.value.div(validatorDepositAmount);
        require(msg.value.mod(validatorDepositAmount) == 0 && depositsCount > 0, "Invalid deposit amount.");

        // calculate withdrawal credentials
        bytes memory withdrawalCredentials = abi.encodePacked(sha256(_publicKey));
        withdrawalCredentials[0] = 0x00;

        do {
            // register new private solo deposit
            solosCounter.increment();
            bytes32 soloId = keccak256(abi.encodePacked(address(this), solosCounter.current()));
            deposits.addDeposit(soloId, msg.sender, msg.sender, validatorDepositAmount);

            Solo storage pendingSolo = pendingSolos[soloId];
            pendingSolo.amount = validatorDepositAmount;
            pendingSolo.withdrawalCredentials = withdrawalCredentials;

            // register wallet manager
            managers.addWalletManager(soloId, msg.sender);

            // emit event
            emit WithdrawalKeyAdded(soloId, _publicKey, withdrawalCredentials);

            depositsCount--;
        } while (depositsCount > 0);
    }

    /**
    * @dev Function for canceling solo deposits.
    * The deposit can only be canceled before it will be registered as a validator.
    * @param _soloId - ID of the solo deposit.
    * @param _recipient - address where the canceled amount will be transferred (must be the same as when the deposit was made).
    * For the solo deposit with its own withdrawal key, the recipient is the deposit sender.
    */
    function cancelDeposit(bytes32 _soloId, address payable _recipient) external {
        uint256 depositAmount = deposits.getDeposit(_soloId, msg.sender, _recipient);
        require(depositAmount > 0, "The user does not have a deposit.");

        Solo memory pendingSolo = pendingSolos[_soloId];
        require(pendingSolo.amount > 0, "Cannot cancel deposit which has started staking.");

        // cancel solo deposit
        deposits.cancelDeposit(_soloId, msg.sender, _recipient, depositAmount);
        delete pendingSolos[_soloId];

        // transfer canceled amount to the recipient
        _recipient.sendValue(depositAmount);
    }

    /**
    * Function for registering new validator for solo deposit.
    * @param _pubKey - BLS public key of the validator, generated by the operator.
    * @param _signature - BLS signature of the validator, generated by the operator.
    * @param _depositDataRoot - hash tree root of the deposit data, generated by the operator.
    * @param _soloId - ID of the solo to register validator for.
    */
    function registerValidator(
        bytes calldata _pubKey,
        bytes calldata _signature,
        bytes32 _depositDataRoot,
        bytes32 _soloId
    )
        external
    {
        require(operators.isOperator(msg.sender), "Permission denied.");

        Solo memory pendingSolo = pendingSolos[_soloId];
        require(pendingSolo.amount == settings.validatorDepositAmount(), "Invalid validator deposit amount.");

        uint256 maintainerFee;
        bytes memory withdrawalCredentials = pendingSolo.withdrawalCredentials;
        if (withdrawalCredentials.length == 0) {
            // set custodial withdrawal credentials
            withdrawalCredentials = settings.withdrawalCredentials();

            // allow transfer for not private solos
            validatorTransfers.allowTransfer(_soloId);

            // set maintainer fee for not private solos
            maintainerFee = settings.maintainerFee();
        }

        // cleanup pending solo deposit
        delete pendingSolos[_soloId];

        // register validator
        validators.register(
            _pubKey,
            withdrawalCredentials,
            _soloId,
            pendingSolo.amount,
            maintainerFee
        );
        validatorRegistration.deposit{value: pendingSolo.amount}(
            _pubKey,
            withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * @dev Function for transferring validator ownership to the new solo.
    * @param _validatorId - ID of the validator to transfer.
    * @param _validatorReward - validator current reward.
    * @param _soloId - ID of the solo to register validator for.
    * @param _managerSignature - ECDSA signature of the previous entity manager if such exists.
    */
    function transferValidator(
        bytes32 _validatorId,
        uint256 _validatorReward,
        bytes32 _soloId,
        bytes calldata _managerSignature
    )
        external
    {
        require(operators.isOperator(msg.sender), "Permission denied.");

        Solo memory pendingSolo = pendingSolos[_soloId];
        require(pendingSolo.amount == settings.validatorDepositAmount(), "Invalid validator deposit amount.");
        require(pendingSolo.withdrawalCredentials.length == 0, "Cannot transfer to the private solo.");

        (uint256 depositAmount, uint256 prevMaintainerFee, bytes32 prevEntityId,) = validators.validators(_validatorId);
        require(managers.canTransferValidator(prevEntityId, _managerSignature), "Invalid transfer manager signature.");
        require(validatorTransfers.checkTransferAllowed(prevEntityId), "Validator transfer is not allowed.");

        // calculate previous entity reward and fee
        (uint256 prevUserDebt, uint256 prevMaintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);
        uint256 prevEntityReward = _validatorReward.sub(prevUserDebt).sub(prevMaintainerDebt);
        uint256 maintainerDebt = (prevEntityReward.mul(prevMaintainerFee)).div(10000);

        // allow transfer for the new entity
        validatorTransfers.allowTransfer(_soloId);

        // cleanup pending solo deposit
        delete pendingSolos[_soloId];

        // transfer validator to the new solo
        validators.update(_validatorId, _soloId, settings.maintainerFee());

        // register validator transfer
        validatorTransfers.registerTransfer{value: depositAmount}(
            _validatorId,
            prevEntityId,
            prevEntityReward.sub(maintainerDebt),
            maintainerDebt
        );
    }
}
