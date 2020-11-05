// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../interfaces/IStakingEthToken.sol";
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

    // @dev Address of the StakingEthToken contract.
    IStakingEthToken private stakingEthToken;

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
        address _stakingEthToken,
        address _settings,
        address _operators,
        address _validatorRegistration,
        address _validators
    )
        public override initializer
    {
        stakingEthToken = IStakingEthToken(_stakingEthToken);
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
        require(msg.value > 0 && msg.value.mod(settings.minDepositUnit()) == 0, "Pool: invalid deposit amount");
        require(msg.value <= settings.maxDepositAmount(), "Pool: deposit amount is too large");
        require(!settings.pausedContracts(address(this)), "Pool: contract is paused");

        // update pool collected amount
        collectedAmount = collectedAmount.add(msg.value);

        // mint new staking tokens
        stakingEthToken.mint(msg.sender, msg.value);
    }

    /**
     * @dev See {IPool-registerValidator}.
     */
    function registerValidator(bytes calldata _pubKey, bytes calldata _signature, bytes32 _depositDataRoot) external override {
        require(operators.isOperator(msg.sender), "Pool: permission denied");

        // reduce pool collected amount
        uint256 depositAmount = settings.validatorDepositAmount();
        require(collectedAmount >= depositAmount, "Pool: insufficient collected amount");
        collectedAmount = collectedAmount.sub(depositAmount);

        // register validator
        validators.register(_pubKey, poolId);
        validatorRegistration.deposit{value : depositAmount}(
            _pubKey,
            abi.encodePacked(settings.withdrawalCredentials()),
            _signature,
            _depositDataRoot
        );
    }
}
