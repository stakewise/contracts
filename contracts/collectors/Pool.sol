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

    // @dev Total activated validators.
    uint256 public override activatedValidators;

    // @dev Pool validator withdrawal credentials.
    bytes32 public override withdrawalCredentials;

    // @dev Address of the ETH2 Deposit Contract (deployed by Ethereum).
    IDepositContract public override validatorRegistration;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the Validators contract.
    IValidators private validators;

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
     * The `initialize` must be called before upgrading in previous implementation contract:
     * https://github.com/stakewise/contracts/blob/v1.0.0/contracts/collectors/Pool.sol#L42
     */
    function upgrade(
        address _oracles,
        uint256 _activatedValidators,
        uint256 _pendingValidators,
        uint256 _minActivatingDeposit,
        uint256 _pendingValidatorsLimit
    )
        external override onlyAdmin whenPaused
    {
        require(oracles == address(0), "Pool: already upgraded");
        oracles = _oracles;

        pendingValidators = _pendingValidators;
        activatedValidators = _activatedValidators;
        emit ActivatedValidatorsUpdated(_activatedValidators, msg.sender);

        minActivatingDeposit = _minActivatingDeposit;
        emit MinActivatingDepositUpdated(_minActivatingDeposit, msg.sender);

        pendingValidatorsLimit = _pendingValidatorsLimit;
        emit PendingValidatorsLimitUpdated(_pendingValidatorsLimit, msg.sender);
    }

    /**
     * @dev See {IPool-setWithdrawalCredentials}.
     */
    function setWithdrawalCredentials(bytes32 _withdrawalCredentials) external override onlyAdmin {
        withdrawalCredentials = _withdrawalCredentials;
        emit WithdrawalCredentialsUpdated(_withdrawalCredentials);
    }

    /**
     * @dev See {IPool-setMinActivatingDeposit}.
     */
    function setMinActivatingDeposit(uint256 _minActivatingDeposit) external override onlyAdmin {
        minActivatingDeposit = _minActivatingDeposit;
        emit MinActivatingDepositUpdated(_minActivatingDeposit, msg.sender);
    }

    /**
     * @dev See {IPool-setPendingValidatorsLimit}.
     */
    function setPendingValidatorsLimit(uint256 _pendingValidatorsLimit) external override onlyAdmin {
        require(_pendingValidatorsLimit < 10000, "Pool: invalid limit");
        pendingValidatorsLimit = _pendingValidatorsLimit;
        emit PendingValidatorsLimitUpdated(_pendingValidatorsLimit, msg.sender);
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
     * @dev See {IPool-addDeposit}.
     */
    function addDeposit() external payable override whenNotPaused {
        require(msg.value > 0, "Pool: invalid deposit amount");

        // mint tokens for small deposits immediately
        if (msg.value <= minActivatingDeposit) {
            stakedEthToken.mint(msg.sender, msg.value);
            return;
        }

        // mint tokens if current pending validators limit is not exceed
        uint256 _pendingValidators = pendingValidators.add((address(this).balance).div(VALIDATOR_DEPOSIT));
        uint256 _activatedValidators = activatedValidators; // gas savings
        uint256 validatorIndex = _activatedValidators.add(_pendingValidators);
        if (validatorIndex.mul(1e4) <= _activatedValidators.mul(pendingValidatorsLimit.add(1e4))) {
            stakedEthToken.mint(msg.sender, msg.value);
        } else {
            // lock deposit amount until validator activated
            activations[msg.sender][validatorIndex] = activations[msg.sender][validatorIndex].add(msg.value);
            emit ActivationScheduled(msg.sender, validatorIndex, msg.value);
        }
    }

    /**
     * @dev See {IPool-canActivate}.
     */
    function canActivate(uint256 _validatorIndex) external view override returns (bool) {
        return _validatorIndex.mul(1e4) <= activatedValidators.mul(pendingValidatorsLimit.add(1e4));
    }

    /**
     * @dev See {IPool-activate}.
     */
    function activate(address _account, uint256 _validatorIndex) external override whenNotPaused {
        require(_validatorIndex.mul(1e4) <= activatedValidators.mul(pendingValidatorsLimit.add(1e4)), "Pool: validator is not active yet");

        uint256 amount = activations[_account][_validatorIndex];
        require(amount > 0, "Pool: invalid validator index");

        delete activations[_account][_validatorIndex];
        stakedEthToken.mint(_account, amount);
        emit Activated(_account, _validatorIndex, amount, msg.sender);
    }

    /**
     * @dev See {IPool-activateMultiple}.
     */
    function activateMultiple(address _account, uint256[] calldata _validatorIndexes) external override whenNotPaused {
        uint256 toMint;
        uint256 _activatedValidators = activatedValidators;
        for (uint256 i = 0; i < _validatorIndexes.length; i++) {
            uint256 validatorIndex = _validatorIndexes[i];
            require(validatorIndex.mul(1e4) <= _activatedValidators.mul(pendingValidatorsLimit.add(1e4)), "Pool: validator is not active yet");

            uint256 amount = activations[_account][validatorIndex];
            toMint = toMint.add(amount);
            delete activations[_account][validatorIndex];

            emit Activated(_account, validatorIndex, amount, msg.sender);
        }
        require(toMint > 0, "Pool: invalid validator index");
        stakedEthToken.mint(_account, toMint);
    }

    /**
     * @dev See {IPool-registerValidator}.
     */
    function registerValidator(Validator calldata _validator) external override whenNotPaused {
        require(validators.isOperator(msg.sender), "Pool: access denied");

        // register validator
        validators.register(keccak256(abi.encodePacked(_validator.publicKey)));
        emit ValidatorRegistered(_validator.publicKey, msg.sender);

        // update number of pending validators
        pendingValidators = pendingValidators.add(1);

        validatorRegistration.deposit{value : VALIDATOR_DEPOSIT}(
            _validator.publicKey,
            abi.encodePacked(withdrawalCredentials),
            _validator.signature,
            _validator.depositDataRoot
        );
    }
}
