// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "../interfaces/IDeposits.sol";
import "../interfaces/IValidatorTransfers.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/ISettings.sol";

/**
 * @title Validator Transfers
 *
 * @dev This contract keeps track of validator transfers to other entities.
 * It should be used to match entities who would like to finish staking with entities who would like to be registered as new validators.
 * It allows for entity users to withdraw their deposits and register their rewards as debts until Phase 2 release.
 * It will be used up to Phase 2 release.
 */
contract ValidatorTransfers is IValidatorTransfers, Initializable {
    using Address for address payable;
    using SafeMath for uint256;

    /**
    * @dev Structure to store information about validator debt to the entities it was transferred from.
    * @param userDebt - validator total debt to the entity users.
    * @param maintainerDebt - validator total debt to the entities maintainer.
    * @param resolved - indicates whether debts were resolved or not.
    */
    struct ValidatorDebt {
        uint256 userDebt;
        uint256 maintainerDebt;
        bool resolved;
    }

    /**
    * @dev Structure to store information about entity reward in validator.
    * @param validatorId - ID of the transferred validator.
    * @param amount - entity reward amount.
    */
    struct EntityReward {
        bytes32 validatorId;
        uint256 amount;
    }

    /**
    * @dev Structure to store information about user withdrawals.
    * @param rewardWithdrawn - tracks whether user has withdrawn its reward.
    * @param depositWithdrawn - tracks whether user has withdrawn its deposit.
    */
    struct UserWithdrawal {
        bool rewardWithdrawn;
        bool depositWithdrawn;
    }

    /**
    * Structure to store information about allowed transfers.
    * @param allowed - defines whether transfer is allowed or not.
    * @param time - minimal time when the transfer can be initiated.
    */
    struct TransferAllowance {
        bool allowed;
        uint256 time;
    }

    // @dev Maps validator ID to its debt information.
    mapping(bytes32 => ValidatorDebt) public override validatorDebts;

    // @dev Maps entity ID to the rewards it owns in the validator.
    mapping(bytes32 => EntityReward) public override entityRewards;

    // @dev Maps user ID to its withdrawal information.
    mapping(bytes32 => UserWithdrawal) public override userWithdrawals;

    // @dev Maps entity ID to its whether transfer allowed or not.
    mapping(bytes32 => TransferAllowance) private allowedTransfers;

    // @dev Address of the periodic Pools contract.
    address private periodicPools;

    // @dev Address of the phase 2 Pools contract.
    address private phase2Pools;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Address of the Groups contract.
    address private groups;

    // @dev Address of the Withdrawals contract.
    address private withdrawals;

    // @dev Address of the Deposits contract.
    IDeposits private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Checks whether the caller is collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == periodicPools ||
            msg.sender == phase2Pools ||
            msg.sender == solos ||
            msg.sender == groups,
            "Permission denied."
        );
        _;
    }

    /**
     * @dev See {IValidatorTransfers-initialize}.
     */
    function initialize(
        address _periodicPools,
        address _phase2Pools,
        address _solos,
        address _groups,
        address _withdrawals,
        address _deposits,
        address _settings,
        address _validators
    )
        public override initializer
    {
        periodicPools = _periodicPools;
        phase2Pools = _phase2Pools;
        solos = _solos;
        groups = _groups;
        withdrawals = _withdrawals;
        deposits = IDeposits(_deposits);
        settings = ISettings(_settings);
        validators = IValidators(_validators);
    }

    /**
     * @dev See {IValidatorTransfers-registerTransfer}.
     */
    function registerTransfer(
        bytes32 _validatorId,
        bytes32 _prevEntityId,
        uint256 _userDebt,
        uint256 _maintainerDebt
    )
        external override payable onlyCollectors
    {
        require(!settings.pausedContracts(address(this)), "Validator transfers are paused.");

        // register entity reward for later withdrawals
        entityRewards[_prevEntityId] = EntityReward(_validatorId, _userDebt);

        // increment validator debts
        ValidatorDebt storage validatorDebt = validatorDebts[_validatorId];
        validatorDebt.userDebt = (validatorDebt.userDebt).add(_userDebt);
        validatorDebt.maintainerDebt = (validatorDebt.maintainerDebt).add(_maintainerDebt);

        // emit transfer event
        (, uint256 newMaintainerFee, bytes32 newEntityId,) = validators.validators(_validatorId);
        emit ValidatorTransferred(
            _validatorId,
            _prevEntityId,
            newEntityId,
            _userDebt,
            _maintainerDebt,
            newMaintainerFee,
            settings.stakingDurations(msg.sender)
        );
    }

    /**
     * @dev See {IValidatorTransfers-resolveDebt}.
     */
    function resolveDebt(bytes32 _validatorId) external override {
        require(msg.sender == withdrawals, "Permission denied.");

        ValidatorDebt storage validatorDebt = validatorDebts[_validatorId];
        validatorDebt.resolved = true;
        emit DebtResolved(_validatorId);
    }

    /**
     * @dev See {IValidatorTransfers-allowTransfer}.
     */
    function allowTransfer(bytes32 _entityId) external override onlyCollectors {
        // solhint-disable-next-line not-rely-on-time
        allowedTransfers[_entityId] = TransferAllowance(true, now + settings.stakingDurations(msg.sender));
    }

    /**
     * @dev See {IValidatorTransfers-checkTransferAllowed}.
     */
    function checkTransferAllowed(bytes32 _entityId) external override view returns (bool) {
        TransferAllowance storage transferAllowance = allowedTransfers[_entityId];

        // solhint-disable-next-line not-rely-on-time
        if (!transferAllowance.allowed || transferAllowance.time > now) {
            return false;
        }

        return true;
    }

    /**
     * @dev See {IValidatorTransfers-withdraw}.
     */
    function withdraw(bytes32 _entityId, address payable _recipient) external override {
        EntityReward memory entityReward = entityRewards[_entityId];
        require(entityReward.validatorId != "", "An entity with such ID is not registered.");

        bytes32 userId = keccak256(abi.encodePacked(_entityId, msg.sender, _recipient));
        uint256 userDeposit = deposits.amounts(userId);
        require(userDeposit > 0, "User does not have a share in this entity.");

        UserWithdrawal storage userWithdrawal = userWithdrawals[userId];

        uint256 depositWithdrawal;
        if (!userWithdrawal.depositWithdrawn) {
            depositWithdrawal = userDeposit;
            userWithdrawal.depositWithdrawn = true;
        }

        uint256 rewardWithdrawal;
        ValidatorDebt memory validatorDebt = validatorDebts[entityReward.validatorId];
        if (validatorDebt.resolved && !userWithdrawal.rewardWithdrawn) {
            (uint256 validatorDepositAmount, , ,) = validators.validators(entityReward.validatorId);
            rewardWithdrawal = (entityReward.amount).mul(userDeposit).div(validatorDepositAmount);
            userWithdrawal.rewardWithdrawn = true;
        }

        uint256 withdrawalAmount = depositWithdrawal.add(rewardWithdrawal);
        require(withdrawalAmount > 0, "Nothing to withdraw.");

        // transfer withdrawal amount to the recipient
        emit UserWithdrawn(msg.sender, _recipient, _entityId, depositWithdrawal, rewardWithdrawal);
        _recipient.sendValue(withdrawalAmount);
    }

    /**
    * @dev Fallback function to receive transfers.
    */
    receive() external payable {}
}
