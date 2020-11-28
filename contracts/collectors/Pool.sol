// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IPool.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, Initializable {
    using SafeMath for uint256;
    using Address for address payable;

    // @dev Total amount collected.
    uint256 public override collectedAmount;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration public override validatorRegistration;

    // @dev ID of the pool.
    bytes32 private poolId;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the Validators contract.
    IValidators private validators;

    /**
     * @dev See {IPool-initialize}.
     */
    function initialize(
        address _stakedEthToken,
        address _settings,
        address _operators,
        address _validatorRegistration,
        address _validators
    )
        public override initializer
    {
        stakedEthToken = IStakedEthToken(_stakedEthToken);
        settings = ISettings(_settings);
        operators = IOperators(_operators);
        validatorRegistration = IValidatorRegistration(_validatorRegistration);
        validators = IValidators(_validators);
        // there is only one pool instance, the ID is static
        poolId = keccak256(abi.encodePacked(address(this)));
    }

    /**
     * @dev See {IPool-addDeposit}.
     */
    function addDeposit() external payable override {
        require(msg.value > 0, "Pool: invalid deposit amount");
        require(msg.value <= settings.maxDepositAmount(), "Pool: deposit amount is too large");
        require(!settings.pausedContracts(address(this)), "Pool: contract is paused");

        // update pool collected amount
        collectedAmount = collectedAmount.add(msg.value);

        // mint new staked tokens
        stakedEthToken.mint(msg.sender, msg.value);
    }

    /**
     * @dev See {IPool-registerValidator}.
     */
    function registerValidator(Validator calldata _validator) external override {
        require(operators.isOperator(msg.sender), "Pool: permission denied");

        // reduce pool collected amount
        uint256 depositAmount = settings.validatorDepositAmount();
        collectedAmount = collectedAmount.sub(depositAmount, "Pool: insufficient collected amount");

        // register validator
        validators.register(_validator.publicKey, poolId);
        validatorRegistration.deposit{value : depositAmount}(
            _validator.publicKey,
            abi.encodePacked(settings.withdrawalCredentials()),
            _validator.signature,
            _validator.depositDataRoot
        );
    }
}
