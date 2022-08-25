// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedToken.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IPoolValidators.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IStakedToken.sol";
import "../interfaces/IPoolValidators.sol";
import "../interfaces/IGNOToken.sol";
import "../interfaces/IMGNOWrapper.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, OwnablePausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    // @dev Validator deposit amount.
    uint256 public constant override VALIDATOR_TOTAL_DEPOSIT = 32 ether;

    // @dev Address of the GNO <-> mGNO wrapper.
    address public constant override MGNO_WRAPPER = 0x647507A70Ff598F386CB96ae5046486389368C66;

    // @dev Address of the GNO token.
    address public constant override GNO_TOKEN = 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb;

    // @dev Address of the mGNO token.
    address public constant override MGNO_TOKEN = 0x722fc4DAABFEaff81b97894fC623f91814a1BF68;

    // @dev base unit.
    uint256 internal constant WAD = 1e18;

    // @dev Total activated validators.
    uint256 public override activatedValidators;

    // @dev Pool validator withdrawal credentials.
    bytes32 public override withdrawalCredentials;

    // @dev Address of the GBC Deposit Contract.
    IDepositContract public override validatorRegistration;

    // @dev Address of the StakedToken contract.
    IStakedToken private stakedToken;

    // @dev Address of the PoolValidators contract.
    IPoolValidators private validators;

    // @dev Address of the Oracles contract.
    address private oracles;

    // @dev Maps senders to the validator index that it will be activated in.
    mapping(address => mapping(uint256 => uint256)) public override activations;

    // @dev Total pending validators.
    uint256 public override pendingValidators;

    // @dev Amount of deposited mGNO that is not considered for the activation period.
    uint256 public override minActivatingDeposit;

    // @dev Pending validators percent limit. If it's not exceeded tokens can be minted immediately.
    uint256 public override pendingValidatorsLimit;

    /**
     * @dev See {IPool-initialize}.
     */
    function initialize(
        address admin,
        bytes32 _withdrawalCredentials,
        address _validatorRegistration,
        address _stakedToken,
        address _validators,
        address _oracles,
        uint256 _minActivatingDeposit,
        uint256 _pendingValidatorsLimit
    )
        external override initializer
    {
        require(admin != address(0), "Pool: invalid admin address");
        require(_withdrawalCredentials != "", "Pool: invalid withdrawal credentials");
        require(_validatorRegistration != address(0), "Pool: invalid ValidatorRegistration address");
        require(_stakedToken != address(0), "Pool: invalid StakedToken address");
        require(_validators != address(0), "Pool: invalid Validators address");
        require(_oracles != address(0), "Pool: invalid Oracles address");
        require(_pendingValidatorsLimit < 1e4, "Pool: invalid limit");

        // initialize admin user
        __OwnablePausableUpgradeable_init(admin);

        withdrawalCredentials = _withdrawalCredentials;
        validatorRegistration = IDepositContract(_validatorRegistration);
        stakedToken = IStakedToken(_stakedToken);
        validators = IPoolValidators(_validators);
        oracles = _oracles;

        minActivatingDeposit = _minActivatingDeposit;
        emit MinActivatingDepositUpdated(_minActivatingDeposit, msg.sender);

        pendingValidatorsLimit = _pendingValidatorsLimit;
        emit PendingValidatorsLimitUpdated(_pendingValidatorsLimit, msg.sender);

        // approve transfers to the validator registration contract
        IERC20Upgradeable(MGNO_TOKEN).safeApprove(_validatorRegistration, type(uint256).max);
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
     * @dev See {IPool-calculateGNO}.
     */
    function calculateGNO(uint256 mgnoIn) public view override returns (uint256) {
        // fetch MGNO <-> GNO conversion rate
        uint256 rate = IMGNOWrapper(MGNO_WRAPPER).tokenRate(GNO_TOKEN);
        return mgnoIn.mul(WAD).div(rate);
    }

    /**
     * @dev See {IPool-stakeGNO}.
     */
    function stakeGNO(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare
    )
        external override
    {
        // mint staked tokens
        if (recipient != address(0)) {
            _stake(recipient, amount);
        } else {
            _stake(msg.sender, amount);
        }

        // withdraw GNO tokens from the user
        IERC20Upgradeable(GNO_TOKEN).safeTransferFrom(msg.sender, address(this), amount);

        // convert GNO tokens to mGNO
        bool success = IGNOToken(GNO_TOKEN).transferAndCall(MGNO_WRAPPER, amount, "");
        require(success, "Pool: failed to convert tokens");

        // emit events for tracking referrers or partners
        if (referredBy != address(0)) {
            if (hasRevenueShare) {
                emit StakedWithPartner(referredBy, amount);
            } else {
                emit StakedWithReferrer(referredBy, amount);
            }
        }
    }

    /**
     * @dev See {IPool-stakeGNOWithPermit}.
     */
    function stakeGNOWithPermit(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external override
    {
        // mint staked tokens
        if (recipient != address(0)) {
            _stake(recipient, amount);
        } else {
            _stake(msg.sender, amount);
        }

        // approve transfers
        IGNOToken(GNO_TOKEN).permit(
            msg.sender,
            address(this),
            nonce,
            expiry,
            true,
            v,
            r,
            s
        );

        // withdraw GNO tokens from the user
        IERC20Upgradeable(GNO_TOKEN).safeTransferFrom(msg.sender, address(this), amount);

        // convert GNO tokens to mGNO
        bool success = IGNOToken(GNO_TOKEN).transferAndCall(MGNO_WRAPPER, amount, "");
        require(success, "Pool: failed to convert tokens");

        // emit events for tracking referrers or partners
        if (referredBy != address(0)) {
            if (hasRevenueShare) {
                emit StakedWithPartner(referredBy, amount);
            } else {
                emit StakedWithReferrer(referredBy, amount);
            }
        }
    }

    /**
     * @dev See {IPool-stakeMGNO}.
     */
    function stakeMGNO(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare
    )
        external override
    {
        // convert mGNO amount to GNO
        uint256 convertedAmount = calculateGNO(amount);

        // mint staked tokens
        if (recipient != address(0)) {
            _stake(recipient, convertedAmount);
        } else {
            _stake(msg.sender, convertedAmount);
        }

        // transfer mGNO tokens from the user
        IERC20Upgradeable(MGNO_TOKEN).safeTransferFrom(msg.sender, address(this), amount);

        // emit events for tracking referrers or partners
        if (referredBy != address(0)) {
            if (hasRevenueShare) {
                emit StakedWithPartner(referredBy, convertedAmount);
            } else {
                emit StakedWithReferrer(referredBy, convertedAmount);
            }
        }
    }

    function _stake(address recipient, uint256 value) internal whenNotPaused {
        require(recipient != address(0), "Pool: invalid recipient");
        require(value > 0, "Pool: invalid deposit amount");

        // mint tokens for small deposits immediately
        if (value <= minActivatingDeposit) {
            stakedToken.mint(recipient, value);
            return;
        }

        // mint tokens if current pending validators limit is not exceed
        uint256 poolBalance = IERC20Upgradeable(MGNO_TOKEN).balanceOf(address(this)).add(value);
        uint256 _pendingValidators = pendingValidators.add((poolBalance).div(VALIDATOR_TOTAL_DEPOSIT));
        uint256 _activatedValidators = activatedValidators; // gas savings
        uint256 validatorIndex = _activatedValidators.add(_pendingValidators);
        if (validatorIndex.mul(1e4) <= _activatedValidators.mul(pendingValidatorsLimit.add(1e4))) {
            stakedToken.mint(recipient, value);
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

        stakedToken.mint(account, activatedAmount);
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
        stakedToken.mint(account, toMint);
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
        validatorRegistration.deposit(
            depositData.publicKey,
            abi.encodePacked(depositData.withdrawalCredentials),
            depositData.signature,
            depositData.depositDataRoot,
            VALIDATOR_TOTAL_DEPOSIT
        );
    }

    /**
     * @dev See {IPool-refund}.
     */
    function refund(uint256 amount) external override onlyAdmin {
        IERC20Upgradeable(MGNO_TOKEN).safeTransferFrom(msg.sender, address(this), amount);
        emit Refunded(msg.sender, amount);
    }
}
