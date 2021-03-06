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

    // @dev Total amount activating.
    uint256 public override totalActivatingAmount;

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

    // @dev Maps senders to the activation time of their deposits.
    mapping(address => mapping(uint256 => uint256)) public override activations;

    // @dev Deposited ETH activation duration.
    uint256 public override activationDuration;

    // @dev Amount of deposited ETH that is not considered for the activation period.
    uint256 public override minActivatingDeposit;

    // @dev Minimal activating share that is required for considering deposits for the activation period.
    uint256 public override minActivatingShare;

    /**
     * @dev See {IPool-initialize}.
     */
    function initialize(
        address _oracles,
        uint256 _activationDuration,
        uint256 _beaconActivatingAmount,
        uint256 _minActivatingDeposit,
        uint256 _minActivatingShare
    )
        external override onlyAdmin whenPaused
    {
        require(oracles == address(0), "Pool: already initialized");
        oracles = _oracles;

        activationDuration = _activationDuration;
        emit ActivationDurationUpdated(_activationDuration, msg.sender);

        uint256 _totalActivatingAmount = _beaconActivatingAmount.add(address(this).balance);
        totalActivatingAmount = _totalActivatingAmount;
        emit TotalActivatingAmountUpdated(_totalActivatingAmount, msg.sender);

        minActivatingDeposit = _minActivatingDeposit;
        emit MinActivatingDepositUpdated(_minActivatingDeposit, msg.sender);

        minActivatingShare = _minActivatingShare;
        emit MinActivatingShareUpdated(_minActivatingShare, msg.sender);
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
     * @dev See {IPool-setMinActivatingShare}.
     */
    function setMinActivatingShare(uint256 _minActivatingShare) external override onlyAdmin {
        require(_minActivatingShare < 10000, "Pool: invalid share");
        minActivatingShare = _minActivatingShare;
        emit MinActivatingShareUpdated(_minActivatingShare, msg.sender);
    }

    /**
     * @dev See {IPool-setActivationDuration}.
     */
    function setActivationDuration(uint256 _activationDuration) external override {
        require(msg.sender == oracles, "Pool: access denied");
        activationDuration = _activationDuration;
        emit ActivationDurationUpdated(_activationDuration, msg.sender);
    }

    /**
     * @dev See {IPool-setTotalActivatingAmount}.
     */
    function setTotalActivatingAmount(uint256 _totalActivatingAmount) external override {
        require(msg.sender == oracles, "Pool: access denied");
        totalActivatingAmount = _totalActivatingAmount;
        emit TotalActivatingAmountUpdated(_totalActivatingAmount, msg.sender);
    }

    /**
     * @dev See {IPool-addDeposit}.
     */
    function addDeposit() external payable override whenNotPaused {
        require(msg.value > 0, "Pool: invalid deposit amount");

        uint256 newTotalActivatingAmount = totalActivatingAmount.add(msg.value);

        // update pool total activating amount
        totalActivatingAmount = newTotalActivatingAmount;

        // mint tokens for small deposits immediately
        if (msg.value <= minActivatingDeposit) {
            stakedEthToken.mint(msg.sender, msg.value);
            return;
        }

        uint256 _activationDuration = activationDuration; // gas savings

        // mint tokens if there are no activation time
        if (_activationDuration == 0) {
            stakedEthToken.mint(msg.sender, msg.value);
            return;
        }

        IStakedEthToken _stakedEthToken = stakedEthToken; // gas savings
        uint256 totalSupply = _stakedEthToken.totalSupply();
        if (totalSupply == 0) {
            _stakedEthToken.mint(msg.sender, msg.value);
            return;
        }

        // calculate activating share
        // multiply by 10000 as minActivatingShare is stored  up to 10000 (5.25% -> 525)
        uint256 activatingShare = newTotalActivatingAmount.mul(1e22).div(totalSupply);

        // mint tokens if current activating share does not exceed the minimum
        if (activatingShare <= minActivatingShare.mul(1e18)) {
            _stakedEthToken.mint(msg.sender, msg.value);
        } else {
            // lock deposit amount until activation duration has passed
            // solhint-disable-next-line not-rely-on-time
            uint256 activationTime = block.timestamp.add(_activationDuration);
            activations[msg.sender][activationTime] = activations[msg.sender][activationTime].add(msg.value);
            emit ActivationScheduled(msg.sender, activationTime, msg.value);
        }
    }

    /**
     * @dev See {IPool-activate}.
     */
    function activate(address _account, uint256 _activationTime) external override whenNotPaused {
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp >= _activationTime, "Pool: activation time is in future");

        uint256 amount = activations[_account][_activationTime];
        require(amount > 0, "Pool: no activating deposit");

        delete activations[_account][_activationTime];
        stakedEthToken.mint(_account, amount);
        emit Activated(_account, _activationTime, amount, msg.sender);
    }

    /**
     * @dev See {IPool-activateMultiple}.
     */
    function activateMultiple(address _account, uint256[] calldata _activationTimes) external override whenNotPaused {
        uint256 toMint;
        for (uint256 i = 0; i < _activationTimes.length; i++) {
            uint256 activationTime = _activationTimes[i];
            // solhint-disable-next-line not-rely-on-time
            require(block.timestamp >= activationTime, "Pool: activation time is in future");

            uint256 amount = activations[_account][activationTime];
            toMint = toMint.add(amount);
            delete activations[_account][activationTime];

            emit Activated(_account, activationTime, amount, msg.sender);
        }
        require(toMint > 0, "Pool: no activating deposits");
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

        validatorRegistration.deposit{value : VALIDATOR_DEPOSIT}(
            _validator.publicKey,
            abi.encodePacked(withdrawalCredentials),
            _validator.signature,
            _validator.depositDataRoot
        );
    }
}
