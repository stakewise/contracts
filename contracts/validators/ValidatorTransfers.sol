pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Admins.sol";
import "../access/Operators.sol";
import "../collectors/Privates.sol";
import "../collectors/Pools.sol";
import "../Deposits.sol";
import "../validators/ValidatorsRegistry.sol";
import "../withdrawals/WalletsRegistry.sol";
import "../withdrawals/Withdrawals.sol";

/**
 * @title Validator Transfers.
 * This contract keeps track of validator transfers to other entities.
 * It should be used to match entities who would like to finish staking with entities who would like to be registered as new validators.
 * It allows for exiting entity users to withdraw their deposits and register their incomes as debts until Phase 2 release.
 * It will be used up to Phase 2 release.
 */
contract ValidatorTransfers is Initializable {
    using SafeMath for uint256;

    /**
    * Structure to store information about validator rewards debt to the entity.
    * @param userDebt - validator rewards debt to the users.
    * @param maintainerDebt - validator rewards debt to the maintainer.
    */
    struct ValidatorDebt {
        uint256 userDebt;
        uint256 maintainerDebt;
        bool resolved;
    }

    // Maps validator ID (hash of the public key) to its debt information.
    mapping(bytes32 => ValidatorDebt) public validatorDebts;

    // Maps collector entity ID to ID of the validator it belonged to.
    mapping(bytes32 => bytes32) public entityValidators;

    // Tracks whether user has withdrawn its deposit.
    mapping(bytes32 => bool) public withdrawnDeposits;

    // Tracks whether user has withdrawn its reward.
    mapping(bytes32 => bool) public withdrawnRewards;

    // Defines whether validator transfers are paused or not.
    bool public isPaused;

    // Address of the Admins contract.
    Admins private admins;

    // Address of the Operators contract.
    Operators private operators;

    // Address of the Deposits contract.
    Deposits private deposits;

    // Address of the Pools contract.
    Pools private pools;

    // Address of the Privates contract.
    Privates private privates;

    // Address of the ValidatorsRegistry contract.
    ValidatorsRegistry private validatorsRegistry;

    // Address of the WalletsRegistry contract.
    WalletsRegistry private walletsRegistry;

    // Address of the Withdrawals contract.
    Withdrawals private withdrawals;

    /**
    * Event for tracking validator transfers.
    * @param validatorId - ID of the transferred validator.
    * @param collectorEntityId - ID of the collector's entity, the validator was transferred from.
    * @param userDebt - validator rewards debt to the users.
    * @param maintainerDebt - validator rewards debt to the maintainer.
    */
    event ValidatorTransferred(
        bytes32 validatorId,
        bytes32 collectorEntityId,
        uint256 userDebt,
        uint256 maintainerDebt
    );

    /**
    * Event for tracking resolved validator debt.
    * @param validatorId - ID of the validator, the debt was resolved for.
    */
    event DebtResolved(bytes32 validatorId);

    /**
    * Event for tracking user withdrawals.
    * @param validatorId - ID of the transferred validator.
    * @param sender - an address of the deposit sender.
    * @param withdrawer - an address of the deposit withdrawer.
    * @param deposit - withdrawn deposit amount.
    * @param reward - withdrawn reward amount.
    */
    event UserWithdrawn(
        bytes32 validatorId,
        address sender,
        address withdrawer,
        uint256 deposit,
        uint256 reward
    );

    /**
    * Event for tracking whether validator transfers are paused or not.
    * @param isPaused - Defines whether validator transfers are paused or not.
    * @param issuer - An address of the account which paused transfers.
    */
    event TransfersPaused(bool isPaused, address issuer);

    /**
    * Constructor for initializing the ValidatorTransfers contract.
    * @param _admins - Address of the Admins contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _pools - Address of the Pools contract.
    * @param _privates - Address of the Privates contract.
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _walletsRegistry - Address of the Wallets Registry contract.
    * @param _withdrawals - Address of the Withdrawals contract.
    */
    function initialize(
        Admins _admins,
        Deposits _deposits,
        Pools _pools,
        Privates _privates,
        ValidatorsRegistry _validatorsRegistry,
        WalletsRegistry _walletsRegistry,
        Withdrawals _withdrawals
    )
        public initializer
    {
        admins = _admins;
        deposits = _deposits;
        pools = _pools;
        privates = _privates;
        validatorsRegistry = _validatorsRegistry;
        walletsRegistry = _walletsRegistry;
        withdrawals = _withdrawals;
    }

    /**
    * Function for registering validator transfers. Can only be called by collectors.
    * @param _validatorId - ID of the transferred validator.
    * @param _collectorEntityId - ID of the collector's entity, the validator was transferred from.
    * @param _userDebt - validator rewards debt to the user(s).
    * @param _maintainerDebt - validator rewards debt to the maintainer.
    */
    function registerTransfer(
        bytes32 _validatorId,
        bytes32 _collectorEntityId,
        uint256 _userDebt,
        uint256 _maintainerDebt
    )
        external payable
    {
        require(!isPaused, "Validator transfers are paused.");
        require(
            !walletsRegistry.assignedValidators(_validatorId),
            "Cannot register transfer for validator with assigned wallet."
        );
        require(msg.sender == address(pools) || msg.sender == address(privates), "Permission denied.");

        entityValidators[_collectorEntityId] = _validatorId;
        ValidatorDebt storage validatorDebt = validatorDebts[_validatorId];
        validatorDebt.userDebt = (validatorDebt.userDebt).add(_userDebt);
        validatorDebt.maintainerDebt = (validatorDebt.maintainerDebt).add(_maintainerDebt);
        emit ValidatorTransferred(
            _validatorId,
            _collectorEntityId,
            validatorDebt.userDebt,
            validatorDebt.maintainerDebt
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
    * Function for pausing validator transfers. Can only be called by an admin account.
    * @param _isPaused - defines whether validator transfers are paused or not.
    */
    function setPaused(bool _isPaused) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");
        isPaused = _isPaused;
        emit TransfersPaused(isPaused, msg.sender);
    }

    /**
    * Function for withdrawing deposits and rewards to the withdrawer address.
    * User reward is calculated based on the deposit amount.
    * @param _collectorEntityId - An ID of the collector entity, the deposit belongs to.
    * @param _withdrawer - An address of the account where reward + deposit will be transferred.
    * Must be the same as specified during deposit creation.
    */
    function withdraw(bytes32 _collectorEntityId, address payable _withdrawer) external {
        require(entityValidators[_collectorEntityId] != "", "Collector entity is not registered.");

        bytes32 userId = keccak256(abi.encodePacked(_collectorEntityId, msg.sender, _withdrawer));
        uint256 userDeposit = deposits.amounts(userId);
        require(userDeposit > 0, "User does not have a share in this collector entity.");

        uint256 depositWithdrawal;
        if (!withdrawnDeposits[userId]) {
            depositWithdrawal = userDeposit;
            withdrawnDeposits[userId] = true;
        }

        uint256 rewardWithdrawal;
        bytes32 validatorId = entityValidators[_collectorEntityId];
        ValidatorDebt memory validatorDebt = validatorDebts[validatorId];
        if (validatorDebt.resolved && !withdrawnRewards[userId]) {
            (uint256 validatorDepositAmount, ,) = validatorsRegistry.validators(validatorId);
            rewardWithdrawal = (validatorDebt.userDebt).mul(userDeposit).div(validatorDepositAmount);
            withdrawnRewards[userId] = true;
        }

        uint256 withdrawalAmount = depositWithdrawal.add(rewardWithdrawal);
        require(withdrawalAmount > 0, "Nothing to withdraw.");

        emit UserWithdrawn(validatorId, msg.sender, _withdrawer, depositWithdrawal, rewardWithdrawal);
        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success,) = _withdrawer.call.value(withdrawalAmount)("");
        // solhint-enable avoid-call-value
        require(success, "Transfer has failed.");
    }

    /**
    * A fallback function to receive transfers.
    */
    function() external payable { }
}
