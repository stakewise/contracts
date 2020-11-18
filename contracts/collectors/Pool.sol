// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/**
 * @dev ABIEncoderV2 is used to enable encoding/decoding of the array of structs. The pragma
 * is required, but ABIEncoderV2 is no longer considered experimental as of Solidity 0.6.0
 */

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IPool.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and register validators.
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
     * @dev See {IPool-registerValidators}.
     */
    function registerValidators(Validator[] calldata _validators) external override {
        require(operators.isOperator(msg.sender), "Pool: permission denied");

        // reduce pool collected amount
        uint256 depositAmount = settings.validatorDepositAmount();
        collectedAmount = collectedAmount.sub(depositAmount.mul(_validators.length), "Pool: insufficient collected amount");

        bytes memory withdrawalCredentials = abi.encodePacked(settings.withdrawalCredentials());
        for (uint256 i = 0; i < _validators.length; i++) {
            Validator calldata validator = _validators[i];

            // register validator
            validators.register(validator.publicKey, poolId);
            validatorRegistration.deposit{value : depositAmount}(
                validator.publicKey,
                withdrawalCredentials,
                validator.signature,
                validator.depositDataRoot
            );
        }
    }
}
