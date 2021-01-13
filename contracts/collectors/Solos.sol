// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../presets/OwnablePausable.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/ISolos.sol";

/**
 * @title Solos
 *
 * @dev Users can create standalone validators with their own withdrawal key using this contract.
 * The validator can be registered as soon as deposit is added.
 */
contract Solos is ISolos, ReentrancyGuard, OwnablePausable {
    using Address for address payable;
    using SafeMath for uint256;

    // @dev Validator deposit amount.
    uint256 public constant VALIDATOR_DEPOSIT = 32 ether;

    // @dev Maps ID of the solo to its information.
    mapping(bytes32 => Solo) public override solos;

    // @dev Address of the ETH2 Deposit Contract (deployed by Ethereum).
    IDepositContract public override validatorRegistration;

    // @dev Solo validator price per month.
    uint256 public override validatorPrice;

    // @dev Solo validator deposit cancel lock duration.
    uint256 public override cancelLockDuration;

    // @dev Address of the Validators contract.
    IValidators private validators;

    /**
    * @dev Constructor for initializing the Solos contract.
    * @param _admin - address of the contract admin.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    * @param _validatorPrice - validator price.
    * @param _cancelLockDuration - cancel lock duration in seconds.
    */
    constructor(
        address _admin,
        address _validatorRegistration,
        address _validators,
        uint256 _validatorPrice,
        uint256 _cancelLockDuration
    )
        OwnablePausable(_admin)
    {
        validatorRegistration = IDepositContract(_validatorRegistration);
        validators = IValidators(_validators);

        // set validator price
        validatorPrice = _validatorPrice;
        emit ValidatorPriceUpdated(_validatorPrice);

        // set cancel lock duration
        cancelLockDuration = _cancelLockDuration;
        emit CancelLockDurationUpdated(_cancelLockDuration);
    }

    /**
     * @dev See {ISolos-addDeposit}.
     */
    function addDeposit(bytes32 _withdrawalCredentials) external payable override whenNotPaused {
        require(_withdrawalCredentials != "" && _withdrawalCredentials[0] == 0x00, "Solos: invalid credentials");
        require(msg.value > 0 && msg.value.mod(VALIDATOR_DEPOSIT) == 0, "Solos: invalid deposit amount");

        bytes32 soloId = keccak256(abi.encodePacked(address(this), msg.sender, _withdrawalCredentials));
        Solo storage solo = solos[soloId];

        // update solo data
        solo.amount = solo.amount.add(msg.value);
        if (solo.withdrawalCredentials == "") {
            solo.withdrawalCredentials = _withdrawalCredentials;
        }
        // the deposit can be canceled after lock has expired and it was not yet sent for staking
        // solhint-disable-next-line not-rely-on-time
        solo.releaseTime = block.timestamp.add(cancelLockDuration);

        // emit event
        emit DepositAdded(soloId, msg.sender, msg.value, _withdrawalCredentials);
    }

    /**
     * @dev See {ISolos-cancelDeposit}.
     */
    function cancelDeposit(bytes32 _withdrawalCredentials, uint256 _amount) external override nonReentrant {
        // update balance
        bytes32 soloId = keccak256(abi.encodePacked(address(this), msg.sender, _withdrawalCredentials));
        Solo storage solo = solos[soloId];

        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp >= solo.releaseTime, "Solos: too early cancel");

        uint256 newAmount = solo.amount.sub(_amount, "Solos: insufficient balance");
        require(newAmount.mod(VALIDATOR_DEPOSIT) == 0, "Solos: invalid cancel amount");

        // emit event
        emit DepositCanceled(soloId, msg.sender, _amount, solo.withdrawalCredentials);

        if (newAmount > 0) {
            solo.amount = newAmount;
            // solhint-disable-next-line not-rely-on-time
            solo.releaseTime = block.timestamp.add(cancelLockDuration);
        } else {
            delete solos[soloId];
        }

        // transfer canceled amount to the recipient
        msg.sender.sendValue(_amount);
    }

    /**
     * @dev See {ISolos-setValidatorPrice}.
     */
    function setValidatorPrice(uint256 _validatorPrice) external override onlyAdmin {
        validatorPrice = _validatorPrice;
        emit ValidatorPriceUpdated(_validatorPrice);
    }

    /**
     * @dev See {ISolos-setCancelLockDuration}.
     */
    function setCancelLockDuration(uint256 _cancelLockDuration) external override onlyAdmin {
        cancelLockDuration = _cancelLockDuration;
        emit CancelLockDurationUpdated(_cancelLockDuration);
    }

    /**
     * @dev See {ISolos-registerValidator}.
     */
    function registerValidator(Validator calldata _validator) external override whenNotPaused {
        require(validators.isOperator(msg.sender), "Solos: access denied");

        // update solo balance
        Solo storage solo = solos[_validator.soloId];
        solo.amount = solo.amount.sub(VALIDATOR_DEPOSIT, "Solos: insufficient balance");

        // register validator
        validators.register(keccak256(abi.encodePacked(_validator.publicKey)));
        emit ValidatorRegistered(_validator.soloId, _validator.publicKey, validatorPrice, msg.sender);

        validatorRegistration.deposit{value : VALIDATOR_DEPOSIT}(
            _validator.publicKey,
            abi.encodePacked(solo.withdrawalCredentials),
            _validator.signature,
            _validator.depositDataRoot
        );
    }
}
