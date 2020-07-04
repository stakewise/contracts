pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../Deposits.sol";
import "../Settings.sol";

/**
 * @title PrivateIndividuals
 * PrivateIndividuals contract allows users to deposit the amount required to become a standalone validator
 * together with their own validator withdrawal key. The validator can be registered as soon as deposit is added.
 */
contract PrivateIndividuals is Initializable {
    using Address for address payable;
    using SafeMath for uint256;
    using ECDSA for bytes32;

    /**
    * Structure for storing information about the private individuals deposit data.
    * @param withdrawalCredentials - withdrawal credentials based on user withdrawal public key.
    * @param amount - validator deposit amount.
    */
    struct ValidatorDeposit {
        bytes withdrawalCredentials;
        uint256 amount;
    }

    // maps IDs of private individuals to the validator deposit data.
    mapping(bytes32 => ValidatorDeposit) public validatorDeposits;

    // total number of private individuals created.
    uint256 private individualsCount;

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

    /**
    * Event for tracking added withdrawal public key by the user.
    * @param entityId - ID of the individual the deposit data was approved for.
    * @param manager - address of the private individual manager.
    * @param withdrawalPublicKey - BLS public key to use for the validator withdrawal, submitted by the user.
    * @param withdrawalCredentials - withdrawal credentials based on user BLS public key.
    */
    event WithdrawalKeyAdded(
        bytes32 indexed entityId,
        address manager,
        bytes withdrawalPublicKey,
        bytes withdrawalCredentials
    );

    /**
    * Constructor for initializing the PrivateIndividuals contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - address of the ValidatorsRegistry contract.
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
        deposits = _deposits;
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validatorsRegistry = _validatorsRegistry;
    }

    /**
    * Function for adding private individual deposits.
    * The deposit amount must be the same as the validator deposit amount.
    * The depositing will be disallowed in case `PrivateIndividuals` contract is paused in `Settings` contract.
    * @param _publicKey - BLS public key for performing validator withdrawal.
    */
    function addDeposit(bytes calldata _publicKey) external payable {
        require(_publicKey.length == 48, "Invalid BLS withdrawal public key.");
        require(msg.value == settings.validatorDepositAmount(), "Invalid deposit amount.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        // register new private individual
        individualsCount++;
        bytes32 individualId = keccak256(abi.encodePacked(address(this), individualsCount));
        deposits.addDeposit(individualId, msg.sender, msg.sender, msg.value);

        // create new deposit data
        ValidatorDeposit storage depositData = validatorDeposits[individualId];
        depositData.amount = msg.value;

        // calculate withdrawal credentials
        bytes memory withdrawalCredentials = abi.encodePacked(sha256(_publicKey));

        // set BLS withdrawal prefix
        withdrawalCredentials[0] = 0x00;
        depositData.withdrawalCredentials = withdrawalCredentials;
        emit WithdrawalKeyAdded(individualId, msg.sender, _publicKey, withdrawalCredentials);
    }

    /**
    * Function for canceling private individual deposits.
    * The deposit can only be canceled before it will be registered as a validator.
    * @param _individualId - ID of the individual the deposit belongs to.
    */
    function cancelDeposit(bytes32 _individualId) external {
        uint256 depositAmount = deposits.getDeposit(_individualId, msg.sender, msg.sender);
        require(depositAmount > 0, "The user does not have a deposit.");

        ValidatorDeposit memory depositData = validatorDeposits[_individualId];
        require(depositData.amount > 0, "Cannot cancel deposit which has started staking.");

        // cancel individual deposit
        deposits.cancelDeposit(_individualId, msg.sender, msg.sender, depositAmount);

        // remove validator deposit data
        delete validatorDeposits[_individualId];

        // transfer canceled amount to the deposit sender
        msg.sender.sendValue(depositAmount);
    }

    /**
    * Function for registering validators for the individuals which are ready to start staking.
    * @param _pubKey - BLS public key of the validator, generated by the operator.
    * @param _signature - BLS signature of the validator, generated by the operator.
    * @param _depositDataRoot - hash tree root of the deposit data, generated by the operator.
    * @param _individualId - ID of the private individual to register validator for.
    */
    function registerValidator(
        bytes calldata _pubKey,
        bytes calldata _signature,
        bytes32 _depositDataRoot,
        bytes32 _individualId
    )
        external
    {
        ValidatorDeposit memory depositData = validatorDeposits[_individualId];
        require(depositData.amount > 0, "Invalid individual ID.");
        require(operators.isOperator(msg.sender), "Permission denied.");

        // cleanup pending validator deposit
        delete validatorDeposits[_individualId];

        // register validator
        validatorsRegistry.register(
            _pubKey,
            depositData.withdrawalCredentials,
            _individualId,
            depositData.amount,
            0
        );
        validatorRegistration.deposit.value(depositData.amount)(
            _pubKey,
            depositData.withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }
}
