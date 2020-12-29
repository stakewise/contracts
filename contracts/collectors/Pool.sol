// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IPool.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;

    // @dev Validator deposit amount.
    uint256 public constant VALIDATOR_DEPOSIT = 32 ether;

    // @dev Total amount collected.
    uint256 public override collectedAmount;

    // @dev Pool validator withdrawal credentials.
    bytes32 public override withdrawalCredentials;

    // @dev Address of the ETH2 Deposit Contract (deployed by Ethereum).
    IDepositContract public override validatorRegistration;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the Validators contract.
    IValidators private validators;

    /**
     * @dev See {IPool-initialize}.
     */
    function initialize(
        address _admin,
        address _stakedEthToken,
        address _validatorRegistration,
        address _validators,
        bytes32 _withdrawalCredentials
    )
        external override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);
        stakedEthToken = IStakedEthToken(_stakedEthToken);
        validatorRegistration = IDepositContract(_validatorRegistration);
        validators = IValidators(_validators);

        // set withdrawal credentials
        withdrawalCredentials = _withdrawalCredentials;
        emit WithdrawalCredentialsUpdated(_withdrawalCredentials);
    }

    /**
     * @dev See {IPool-setWithdrawalCredentials}.
     */
    function setWithdrawalCredentials(bytes32 _withdrawalCredentials) external override onlyAdmin {
        withdrawalCredentials = _withdrawalCredentials;
        emit WithdrawalCredentialsUpdated(_withdrawalCredentials);
    }

    /**
     * @dev See {IPool-addDeposit}.
     */
    function addDeposit() external payable override whenNotPaused {
        require(msg.value > 0, "Pool: invalid deposit amount");

        // update pool collected amount
        collectedAmount = collectedAmount.add(msg.value);

        // mint new staked tokens
        stakedEthToken.mint(msg.sender, msg.value);
    }

    /**
     * @dev See {IPool-registerValidator}.
     */
    function registerValidator(Validator calldata _validator) external override whenNotPaused {
        require(validators.isOperator(msg.sender), "Pool: access denied");

        // reduce pool collected amount
        collectedAmount = collectedAmount.sub(VALIDATOR_DEPOSIT, "Pool: insufficient amount");

        // register validator
        validators.register(keccak256(abi.encodePacked(_validator.publicKey)));
        emit ValidatorRegistered(_validator.publicKey, msg.sender);

        validatorRegistration.deposit{value : VALIDATOR_DEPOSIT}(
            _validator.publicKey,
            abi.encodePacked(withdrawalCredentials),
            _validator.signature,
            _validator.depositDataRoot
        );
    }
}
