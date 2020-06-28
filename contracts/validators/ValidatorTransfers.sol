pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Admins.sol";
import "../access/Operators.sol";
import "../collectors/Individuals.sol";
import "../collectors/Pools.sol";
import "../collectors/Groups.sol";
import "../collectors/Individuals.sol";
import "../Deposits.sol";
import "../Settings.sol";
import "../validators/ValidatorsRegistry.sol";
import "../withdrawals/WalletsRegistry.sol";
import "../withdrawals/Withdrawals.sol";

/**
 * @title Validator Transfers.
 * This contract keeps track of validator transfers to other entities.
 * It should be used to match entities who would like to finish staking with entities who would like to be registered as new validators.
 * It allows for entity users to withdraw their deposits and register their rewards as debts until Phase 2 release.
 * It will be used up to Phase 2 release.
 */
contract ValidatorTransfers is Initializable {
    using Address for address payable;
    using SafeMath for uint256;
    using ECDSA for bytes32;

    /**
    * Structure to store information about validator debt to the entities it was transferred from.
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
    * Structure to store information about entity reward in validator.
    * @param validatorId - ID of the transferred validator.
    * @param amount - entity reward amount.
    */
    struct EntityReward {
        bytes32 validatorId;
        uint256 amount;
    }

    /**
    * Structure to store information about user withdrawals.
    * @param rewardWithdrawn - tracks whether user has withdrawn its reward.
    * @param depositWithdrawn - tracks whether user has withdrawn its deposit.
    */
    struct UserWithdrawal {
        bool rewardWithdrawn;
        bool depositWithdrawn;
    }

    /**
    * Structure to store information about transfer allowance.
    * @param time - minimal time when the transfer can be initiated.
    * @param manager - address of the user who can request the transfer.
    */
    struct TransferAllowance {
        uint256 time;
        address manager;
    }

    // maps validator ID to its debt information.
    mapping(bytes32 => ValidatorDebt) public validatorDebts;

    // maps entity ID to the rewards it owns in the validator.
    mapping(bytes32 => EntityReward) public entityRewards;

    // maps user ID to its withdrawal information.
    mapping(bytes32 => UserWithdrawal) public userWithdrawals;

    // maps entity ID to its transfer allowance information.
    mapping(bytes32 => TransferAllowance) private transferAllowances;

    // address of the Admins contract.
    Admins private admins;

    // address of the Operators contract.
    Operators private operators;

    // address of the Deposits contract.
    Deposits private deposits;

    // address of the Pools contract. TODO: rename to periodicPools
    Pools private pools;

    // address of the Individuals contract.
    Individuals private individuals;

    // address of the Groups contract.
    Groups private groups;

    // address of the Settings contract.
    Settings private settings;

    // address of the ValidatorsRegistry contract.
    ValidatorsRegistry private validatorsRegistry;

    // address of the WalletsRegistry contract.
    WalletsRegistry private walletsRegistry;

    // address of the Withdrawals contract.
    Withdrawals private withdrawals;

    // TODO: move up on contracts redeployment
    // address of the phase 2 Pools contract.
    Pools private phase2Pools;

    // checks whether the caller is the Collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == address(pools) ||
            msg.sender == address(phase2Pools) ||
            msg.sender == address(individuals) ||
            msg.sender == address(groups),
            "Permission denied."
        );
        _;
    }

    /**
    * Event for tracking validator transfers.
    * @param validatorId - ID of the transferred validator.
    * @param prevEntityId - ID of the previous entity, the validator was transferred from.
    * @param newEntityId - ID of the new entity, the validator was transferred to.
    * @param userDebt - validator debt to the users of previous entity.
    * @param maintainerDebt - validator debt to the maintainer of the previous entity.
    * @param newMaintainerFee - new fee to pay to the maintainer after new entity transfer or withdrawal.
    * @param newStakingDuration - new staking duration of the validator.
    */
    event ValidatorTransferred(
        bytes32 validatorId,
        bytes32 prevEntityId,
        bytes32 newEntityId,
        uint256 userDebt,
        uint256 maintainerDebt,
        uint256 newMaintainerFee,
        uint256 newStakingDuration
    );

    /**
    * Event for tracking resolved validator debt.
    * @param validatorId - ID of the validator, the debt was resolved for.
    */
    event DebtResolved(bytes32 validatorId);

    /**
    * Event for tracking user withdrawals.
    * @param sender - address of the deposit sender.
    * @param recipient - address where withdrawn funds will be sent.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param depositAmount - withdrawn deposit amount.
    * @param rewardAmount - withdrawn reward amount.
    */
    event UserWithdrawn(
        address sender,
        address recipient,
        bytes32 entityId,
        uint256 depositAmount,
        uint256 rewardAmount
    );

    /**
    * Constructor for initializing the ValidatorTransfers contract.
    * @param _admins - address of the Admins contract.
    * @param _deposits - address of the Deposits contract.
    * @param _periodicPools - address of the periodic Pools contract.
    * @param _phase2Pools - address of the phase 2 Pools contract.
    * @param _individuals - address of the Individuals contract.
    * @param _groups - address of the Groups contract.
    * @param _settings - address of the Settings contract.
    * @param _validatorsRegistry - address of the Validators Registry contract.
    * @param _walletsRegistry - address of the Wallets Registry contract.
    * @param _withdrawals - address of the Withdrawals contract.
    */
    function initialize(
        Admins _admins,
        Deposits _deposits,
        Pools _periodicPools,
        Pools _phase2Pools,
        Individuals _individuals,
        Groups _groups,
        Settings _settings,
        ValidatorsRegistry _validatorsRegistry,
        WalletsRegistry _walletsRegistry,
        Withdrawals _withdrawals
    )
        public initializer
    {
        admins = _admins;
        deposits = _deposits;
        // TODO: rename to periodicPools
        pools = _periodicPools;
        phase2Pools = _phase2Pools;
        individuals = _individuals;
        groups = _groups;
        settings = _settings;
        validatorsRegistry = _validatorsRegistry;
        walletsRegistry = _walletsRegistry;
        withdrawals = _withdrawals;
    }

    /**
    * Function for registering validator transfers.
    * Only pools can send transfers as they have predefined staking time.
    * @param _validatorId - ID of the transferred validator.
    * @param _prevEntityId - ID of the entity, the validator was transferred from.
    * @param _userDebt - validator reward debt to the entity users.
    * @param _maintainerDebt - validator reward debt to the maintainer.
    */
    function registerTransfer(
        bytes32 _validatorId,
        bytes32 _prevEntityId,
        uint256 _userDebt,
        uint256 _maintainerDebt
    )
        external payable onlyCollectors
    {
        require(!settings.pausedContracts(address(this)), "Validator transfers are paused.");
        require(
            !walletsRegistry.assignedValidators(_validatorId),
            "Cannot register transfer for validator with assigned wallet."
        );

        // register entity reward for later withdrawals
        entityRewards[_prevEntityId] = EntityReward(_validatorId, _userDebt);

        // increment validator debts
        ValidatorDebt storage validatorDebt = validatorDebts[_validatorId];
        validatorDebt.userDebt = (validatorDebt.userDebt).add(_userDebt);
        validatorDebt.maintainerDebt = (validatorDebt.maintainerDebt).add(_maintainerDebt);

        // emit transfer event
        (, uint256 newMaintainerFee, bytes32 newEntityId) = validatorsRegistry.validators(_validatorId);
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
    * Function for resolving validator debt. Can only be called by Withdrawals contract.
    * @param _validatorId - the ID of the validator to resolve debt for.
    */
    function resolveDebt(bytes32 _validatorId) external {
        require(msg.sender == address(withdrawals), "Permission denied.");

        ValidatorDebt storage validatorDebt = validatorDebts[_validatorId];
        validatorDebt.resolved = true;
        emit DebtResolved(_validatorId);
    }

    /**
    * Function for setting transfer allowance. Can only be called by collector contracts.
    * @param _entityId - ID of the entity, the deposit belongs to.
    * @param _manager - address of the manager who will request validator transfer.
    */
    function setAllowance(bytes32 _entityId, address _manager) external onlyCollectors {
        require(_entityId != "", "Invalid entity ID.");
        TransferAllowance storage transferAllowance = transferAllowances[_entityId];
        require(transferAllowance.time == 0, "Transfer allowance has already been set.");

        // solhint-disable-next-line not-rely-on-time
        transferAllowance.time = now + settings.stakingDurations(msg.sender);
        transferAllowance.manager = _manager;
    }

    /**
    * Function for checking transfer allowance.
    * @param _entityId - ID of the entity, the deposit belongs to.
    * @param _signature - ECDSA signature of the previous entity manager if such exists.
    */
    function checkAllowance(bytes32 _entityId, bytes calldata _signature) external view returns (bool) {
        // check entity transfer allowance
        TransferAllowance storage transferAllowance = transferAllowances[_entityId];
        require(transferAllowance.time != 0, "Invalid entity ID.");

        // solhint-disable-next-line not-rely-on-time
        if (transferAllowance.time > now) {
            return false;
        }

        if (transferAllowance.manager != address(0)) {
            bytes32 hash = keccak256(abi.encodePacked("validator transfer", _entityId));
            return transferAllowance.manager == hash.toEthSignedMessageHash().recover(_signature);
        }

        return true;
    }

    /**
    * Function for withdrawing deposits and rewards to the recipient address.
    * User reward is calculated based on the deposit amount.
    * @param _entityId - ID of the entity, the deposit belongs to.
    * @param _recipient - address where withdrawn funds will be sent.
    * Must be the same as specified during the deposit creation.
    */
    function withdraw(bytes32 _entityId, address payable _recipient) external {
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
            (uint256 validatorDepositAmount, ,) = validatorsRegistry.validators(entityReward.validatorId);
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
    * A fallback function to receive transfers.
    */
    function() external payable {}
}
