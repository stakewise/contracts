// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";

/**
 * @title Solos
 *
 * @dev Users can create standalone validators with their own withdrawal key using this contract.
 * The validator can be registered as soon as deposit is added.
 */
contract Solos is Initializable {
    using Address for address payable;
    using SafeMath for uint256;

    /**
    * @dev Structure for storing information about the solo deposits.
    * @param amount - amount deposited.
    * @param withdrawalCredentials - withdrawal credentials of the validators.
    */
    struct Solo {
        uint256 amount;
        bytes withdrawalCredentials;
    }

    // @dev Maps ID of the solo to its information.
    mapping(bytes32 => Solo) public solos;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration public validatorRegistration;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the Validators contract.
    IValidators private validators;

    /**
    * @dev Event for tracking added deposits.
    * @param soloId - ID of the solo.
    * @param sender - address of the deposit sender.
    * @param amount - amount added.
    * @param withdrawalPublicKey - BLS public key to use for the validator withdrawal, submitted by the deposit sender.
    * @param withdrawalCredentials - withdrawal credentials based on submitted BLS public key.
    */
    event DepositAdded(
        bytes32 indexed soloId,
        address sender,
        uint256 amount,
        bytes withdrawalPublicKey,
        bytes withdrawalCredentials
    );

    /**
    * @dev Event for tracking canceled deposits.
    * @param soloId - ID of the solo.
    * @param amount - amount canceled.
    */
    event DepositCanceled(bytes32 indexed soloId, uint256 amount);

    /**
    * @dev Constructor for initializing the Solos contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    */
    function initialize(
        ISettings _settings,
        IOperators _operators,
        IValidatorRegistration _validatorRegistration,
        IValidators _validators
    )
        public initializer
    {
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validators = _validators;
    }

    /**
    * @dev Function for adding solo deposits.
    * The deposit amount must be divisible by the validator deposit amount.
    * The depositing will be disallowed in case `Solos` contract is paused in `Settings` contract.
    * @param _publicKey - BLS public key for performing validator withdrawal.
    */
    function addDeposit(bytes calldata _publicKey) external payable {
        require(_publicKey.length == 48, "Solos: invalid BLS withdrawal public key");
        require(!settings.pausedContracts(address(this)), "Solos: contract is paused");
        require(msg.value <= settings.maxDepositAmount(), "Solos: deposit amount is too large");

        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        require(msg.value > 0 && msg.value.mod(validatorDepositAmount) == 0, "Solos: invalid deposit amount");

        // calculate withdrawal credentials
        bytes memory withdrawalCredentials = abi.encodePacked(sha256(_publicKey));
        withdrawalCredentials[0] = 0x00;

        bytes32 soloId = keccak256(abi.encodePacked(address(this), msg.sender, withdrawalCredentials));
        Solo storage solo = solos[soloId];

        // update solo data
        solo.amount = solo.amount.add(msg.value);
        if (solo.withdrawalCredentials.length != 32) {
            solo.withdrawalCredentials = withdrawalCredentials;
        }

        // emit event
        emit DepositAdded(soloId, msg.sender, msg.value, _publicKey, withdrawalCredentials);
    }

    /**
    * @dev Function for canceling solo deposits.
    * The deposit amount can only be canceled before it will be registered as a validator.
    * @param _withdrawalCredentials - withdrawal credentials of solo validators.
    * @param _amount - amount to cancel.
    */
    function cancelDeposit(bytes calldata _withdrawalCredentials, uint256 _amount) external {
        require(_withdrawalCredentials.length == 32, "Solos: invalid withdrawal credentials");

        // update balance
        bytes32 soloId = keccak256(abi.encodePacked(address(this), msg.sender, _withdrawalCredentials));
        Solo storage solo = solos[soloId];
        solo.amount = solo.amount.sub(_amount, "Solos: insufficient balance");
        require(_amount > 0 && solo.amount.mod(settings.validatorDepositAmount()) == 0, "Solos: invalid cancel amount");

        // emit event
        emit DepositCanceled(soloId, _amount);

        // transfer canceled amount to the recipient
        msg.sender.sendValue(_amount);
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
        require(operators.isOperator(msg.sender), "Solos: permission denied");

        // update solo balance
        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        Solo storage solo = solos[_soloId];
        solo.amount = solo.amount.sub(validatorDepositAmount, "Solos: insufficient balance");

        // register validator
        validators.register(_pubKey, _soloId);
        validatorRegistration.deposit{value: validatorDepositAmount}(
            _pubKey,
            solo.withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }
}
