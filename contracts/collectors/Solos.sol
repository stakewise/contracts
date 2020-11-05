// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/ISolos.sol";

/**
 * @title Solos
 *
 * @dev Users can create standalone validators with their own withdrawal key using this contract.
 * The validator can be registered as soon as deposit is added.
 */
contract Solos is ISolos, Initializable {
    using Address for address payable;
    using SafeMath for uint256;

    // @dev Maps ID of the solo to its information.
    mapping(bytes32 => Solo) public override solos;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration public override validatorRegistration;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the Validators contract.
    IValidators private validators;

    /**
     * @dev See {ISolos-initialize}.
     */
    function initialize(
        address _settings,
        address _operators,
        address _validatorRegistration,
        address _validators
    )
        public override initializer
    {
        settings = ISettings(_settings);
        operators = IOperators(_operators);
        validatorRegistration = IValidatorRegistration(_validatorRegistration);
        validators = IValidators(_validators);
    }

    /**
     * @dev See {ISolos-addDeposit}.
     */
    function addDeposit(bytes32 _withdrawalCredentials) external payable override {
        require(_withdrawalCredentials != "" && _withdrawalCredentials[0] == 0x00, "Solos: invalid withdrawal credentials");
        require(!settings.pausedContracts(address(this)), "Solos: contract is paused");
        require(msg.value <= settings.maxDepositAmount(), "Solos: deposit amount is too large");

        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        require(msg.value > 0 && msg.value.mod(validatorDepositAmount) == 0, "Solos: invalid deposit amount");

        bytes32 soloId = keccak256(abi.encodePacked(address(this), msg.sender, _withdrawalCredentials));
        Solo storage solo = solos[soloId];

        // update solo data
        solo.amount = solo.amount.add(msg.value);
        if (solo.withdrawalCredentials == "") {
            solo.withdrawalCredentials = _withdrawalCredentials;
        }

        // emit event
        emit DepositAdded(soloId, msg.sender, msg.value, _withdrawalCredentials);
    }

    /**
     * @dev See {ISolos-cancelDeposit}.
     */
    function cancelDeposit(bytes32 _withdrawalCredentials, uint256 _amount) external override {
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
     * @dev See {ISolos-registerValidator}.
     */
    function registerValidator(
        bytes calldata _pubKey,
        bytes calldata _signature,
        bytes32 _depositDataRoot,
        bytes32 _soloId
    )
        external override
    {
        require(operators.isOperator(msg.sender), "Solos: permission denied");

        // update solo balance
        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        Solo storage solo = solos[_soloId];
        solo.amount = solo.amount.sub(validatorDepositAmount, "Solos: insufficient balance");

        // register validator
        validators.register(_pubKey, _soloId);
        validatorRegistration.deposit{value : validatorDepositAmount}(
            _pubKey,
            abi.encodePacked(solo.withdrawalCredentials),
            _signature,
            _depositDataRoot
        );
    }
}
