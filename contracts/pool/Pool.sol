// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IPoolValidators.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPoolValidators.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;

    // @dev Validator deposit amount.
    uint256 public constant override VALIDATOR_TOTAL_DEPOSIT = 32 ether;

    // @dev Total activated validators.
    uint256 public override activatedValidators;

    // @dev Pool validator withdrawal credentials.
    bytes32 public override withdrawalCredentials;

    // @dev Address of the ETH2 Deposit Contract (deployed by Ethereum).
    IDepositContract public override validatorRegistration;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the PoolValidators contract.
    IPoolValidators private validators;

    // @dev Address of the Oracles contract.
    address private oracles;

    // @dev Maps senders to the validator index that it will be activated in.
    mapping(address => mapping(uint256 => uint256)) public override activations;

    // @dev Total pending validators.
    uint256 public override pendingValidators;

    // @dev Amount of deposited ETH that is not considered for the activation period.
    uint256 public override minActivatingDeposit;

    // @dev Pending validators percent limit. If it's not exceeded tokens can be minted immediately.
    uint256 public override pendingValidatorsLimit;

    /**
     * @dev See {IPool-upgrade}.
     */
    function upgrade(address _poolValidators, address _oracles) external override onlyAdmin whenPaused {
        require(
            _poolValidators != address(0) && address(validators) == 0xaAc73D4A26Ae6906aa115118b7840b1F19fcd3A5,
            "Pool: invalid PoolValidators address"
        );
        require(
            _oracles != address(0) && address(oracles) == 0x2f1C5E86B13a74f5A6E7B4b35DD77fe29Aa47514,
            "Pool: invalid Oracles address"
        );

        // set contract addresses
        validators = IPoolValidators(_poolValidators);
        oracles = _oracles;
    }

    /**
     * @dev See {IPool-setMinActivatingDeposit}.
     */
    function setMinActivatingDeposit(uint256 newMinActivatingDeposit) external override onlyAdmin {
        minActivatingDeposit = newMinActivatingDeposit;
        emit MinActivatingDepositUpdated(newMinActivatingDeposit, msg.sender);
    }

    /**
     * @dev See {IPool-setPendingValidatorsLimit}.
     */
    function setPendingValidatorsLimit(uint256 newPendingValidatorsLimit) external override onlyAdmin {
        require(newPendingValidatorsLimit < 1e4, "Pool: invalid limit");
        pendingValidatorsLimit = newPendingValidatorsLimit;
        emit PendingValidatorsLimitUpdated(newPendingValidatorsLimit, msg.sender);
    }

    /**
     * @dev See {IPool-setActivatedValidators}.
     */
    function setActivatedValidators(uint256 newActivatedValidators) external override {
        require(msg.sender == oracles || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Pool: access denied");

        // subtract activated validators from pending validators
        pendingValidators = pendingValidators.sub(newActivatedValidators.sub(activatedValidators));
        activatedValidators = newActivatedValidators;
        emit ActivatedValidatorsUpdated(newActivatedValidators, msg.sender);
    }

    /**
     * @dev See {IPool-stake}.
     */
    function stake() external payable override {
        _stake(msg.sender, msg.value);
    }

    /**
     * @dev See {IPool-stakeOnBehalf}.
     */
    function stakeOnBehalf(address recipient) external payable override {
        _stake(recipient, msg.value);
    }

    /**
    * @dev Function for staking ETH using transfer.
    */
    receive() external payable {
        _stake(msg.sender, msg.value);
    }

    /**
     * @dev See {IPool-stakeWithPartner}.
     */
    function stakeWithPartner(address partner) external payable override {
        // stake amount
        _stake(msg.sender, msg.value);
        emit StakedWithPartner(partner, msg.value);
    }

    /**
     * @dev See {IPool-stakeWithPartnerOnBehalf}.
     */
    function stakeWithPartnerOnBehalf(address partner, address recipient) external payable override {
        // stake amount
        _stake(recipient, msg.value);
        emit StakedWithPartner(partner, msg.value);
    }

    /**
     * @dev See {IPool-stakeWithReferrer}.
     */
    function stakeWithReferrer(address referrer) external payable override {
        // stake amount
        _stake(msg.sender, msg.value);
        emit StakedWithReferrer(referrer, msg.value);
    }

    /**
     * @dev See {IPool-stakeWithReferrerOnBehalf}.
     */
    function stakeWithReferrerOnBehalf(address referrer, address recipient) external payable override {
        // stake amount
        _stake(recipient, msg.value);
        emit StakedWithReferrer(referrer, msg.value);
    }

    function _stake(address recipient, uint256 value) internal whenNotPaused {
        require(recipient != address(0), "Pool: invalid recipient");
        require(value > 0, "Pool: invalid deposit amount");

        // mint tokens for small deposits immediately
        if (value <= minActivatingDeposit) {
            stakedEthToken.mint(recipient, value);
            return;
        }

        // mint tokens if current pending validators limit is not exceed
        uint256 _pendingValidators = pendingValidators.add((address(this).balance).div(VALIDATOR_TOTAL_DEPOSIT));
        uint256 _activatedValidators = activatedValidators; // gas savings
        uint256 validatorIndex = _activatedValidators.add(_pendingValidators);
        if (validatorIndex.mul(1e4) <= _activatedValidators.mul(pendingValidatorsLimit.add(1e4))) {
            stakedEthToken.mint(recipient, value);
        } else {
            // lock deposit amount until validator activated
            activations[recipient][validatorIndex] = activations[recipient][validatorIndex].add(value);
            emit ActivationScheduled(recipient, validatorIndex, value);
        }
    }

    /**
     * @dev See {IPool-canActivate}.
     */
    function canActivate(uint256 validatorIndex) external view override returns (bool) {
        return validatorIndex.mul(1e4) <= activatedValidators.mul(pendingValidatorsLimit.add(1e4));
    }

    /**
     * @dev See {IPool-activate}.
     */
    function activate(address account, uint256 validatorIndex) external override whenNotPaused {
        uint256 activatedAmount = _activateAmount(
            account,
            validatorIndex,
            activatedValidators.mul(pendingValidatorsLimit.add(1e4))
        );

        stakedEthToken.mint(account, activatedAmount);
    }

    /**
     * @dev See {IPool-activateMultiple}.
     */
    function activateMultiple(address account, uint256[] calldata validatorIndexes) external override whenNotPaused {
        uint256 toMint;
        uint256 maxValidatorIndex = activatedValidators.mul(pendingValidatorsLimit.add(1e4));
        for (uint256 i = 0; i < validatorIndexes.length; i++) {
            uint256 activatedAmount = _activateAmount(account, validatorIndexes[i], maxValidatorIndex);
            toMint = toMint.add(activatedAmount);
        }
        stakedEthToken.mint(account, toMint);
    }

    function _activateAmount(
        address account,
        uint256 validatorIndex,
        uint256 maxValidatorIndex
    )
        internal returns (uint256 amount)
    {
        require(validatorIndex.mul(1e4) <= maxValidatorIndex, "Pool: validator is not active yet");

        amount = activations[account][validatorIndex];
        require(amount > 0, "Pool: invalid validator index");

        delete activations[account][validatorIndex];
        emit Activated(account, validatorIndex, amount, msg.sender);
    }

    /**
     * @dev See {IPool-registerValidator}.
     */
    function registerValidator(IPoolValidators.DepositData calldata depositData) external override whenNotPaused {
        require(msg.sender == address(validators), "Pool: access denied");
        require(depositData.withdrawalCredentials == withdrawalCredentials, "Pool: invalid withdrawal credentials");

        // update number of pending validators
        pendingValidators = pendingValidators.add(1);
        emit ValidatorRegistered(depositData.publicKey, depositData.operator);

        // register validator
        validatorRegistration.deposit{value : VALIDATOR_TOTAL_DEPOSIT}(
            depositData.publicKey,
            abi.encodePacked(depositData.withdrawalCredentials),
            depositData.signature,
            depositData.depositDataRoot
        );
    }

    /**
     * @dev See {IPool-refund}.
     */
    function refund() external override payable {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == address(validators), "Pool: access denied");
        require(msg.value > 0, "Pool: invalid refund amount");
        emit Refunded(msg.sender, msg.value);
    }
}
