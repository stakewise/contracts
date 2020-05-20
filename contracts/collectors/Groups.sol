pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../validators/ValidatorTransfers.sol";
import "../Deposits.sol";
import "../Settings.sol";

/**
 * @title Groups
 * Groups contract allows users to create groups and invite other users to stake together.
 * The validator can be registered for the group as soon as it collects the validator deposit amount.
 */
contract Groups is Initializable {
    using Address for address payable;
    using SafeMath for uint256;

    /**
    * Structure for storing information about the group which was not yet sent for staking.
    * @param collectedAmount - total amount collected by the group members.
    * @param manager - address of the group manager.
    * @param members - mapping for users memberships in a group.
    */
    struct PendingGroup {
        uint256 collectedAmount;
        address manager;
        mapping(address => bool) members;
    }

    // maps IDs of the groups which were not yet sent for staking to the information about them.
    mapping(bytes32 => PendingGroup) public pendingGroups;

    // total number of groups created.
    uint256 private groupsCount;

    // address of the Deposits contract.
    Deposits private deposits;

    // address of the Settings contract.
    Settings private settings;

    // address of the Operators contract.
    Operators private operators;

    // address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // address of the Validators Registry contract.
    ValidatorsRegistry private validatorsRegistry;

    // address of the Validator Transfers contract.
    ValidatorTransfers private validatorTransfers;

    /**
    * Event for tracking new groups.
    * @param manager - address of the group manager.
    * @param groupId - ID of the created group.
    * @param members - list of group members.
    */
    event GroupCreated(address manager, bytes32 groupId, address[] members);

    /**
    * Constructor for initializing the Groups contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - address of the Validators Registry contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
    */
    function initialize(
        Deposits _deposits,
        Settings _settings,
        Operators _operators,
        IValidatorRegistration _validatorRegistration,
        ValidatorsRegistry _validatorsRegistry,
        ValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        deposits = _deposits;
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validatorsRegistry = _validatorsRegistry;
        validatorTransfers = _validatorTransfers;
    }

    /**
    * Function for creating new groups.
    * It will not be possible to create new groups in case `Groups` contract is paused in the `Settings` contract.
    * @param _members - list of group members. Only addresses in the list and the group creator will be able to deposit in the group.
    */
    function createGroup(address[] calldata _members) external {
        require(!settings.pausedContracts(address(this)), "New groups creation is currently disabled.");
        require(_members.length > 0, "The group members list cannot be empty.");

        // create new group
        groupsCount++;
        bytes32 groupId = keccak256(abi.encodePacked(address(this), groupsCount));
        PendingGroup storage pendingGroup = pendingGroups[groupId];

        // register group members
        for (uint i = 0; i < _members.length; i++) {
            pendingGroup.members[_members[i]] = true;
        }

        // register group manager
        pendingGroup.manager = msg.sender;
        emit GroupCreated(pendingGroup.manager, groupId, _members);
    }

    /**
    * Function for adding deposits in groups. The depositing will be disallowed in case
    * `Groups` contract is paused in `Settings` contract.
    * @param _groupId - ID of the group the user would like to deposit to.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function addDeposit(bytes32 _groupId, address _recipient) external payable {
        require(_recipient != address(0), "Invalid recipient address.");
        require(msg.value > 0 && (msg.value).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit amount.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        PendingGroup storage pendingGroup = pendingGroups[_groupId];
        require(
            pendingGroup.manager == msg.sender || pendingGroup.members[msg.sender],
            "The sender is not a member or a manager of the group."
        );

        require(
            (pendingGroup.collectedAmount).add(msg.value) <= settings.validatorDepositAmount(),
            "The deposit amount is bigger than the amount required to collect."
        );

        // register user deposit
        deposits.addDeposit(_groupId, msg.sender, _recipient, msg.value);

        // update group progress
        pendingGroup.collectedAmount = (pendingGroup.collectedAmount).add(msg.value);
    }

    /**
    * Function for canceling deposits in groups.
    * @param _groupId - ID of the group the deposit was added to.
    * @param _recipient - address where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - amount to cancel from the deposit.
    */
    function cancelDeposit(bytes32 _groupId, address payable _recipient, uint256 _amount) external {
        require(_amount > 0 && (_amount).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit cancel amount.");
        require(
            deposits.getDeposit(_groupId, msg.sender, _recipient) >= _amount,
            "The user does not have specified deposit cancel amount."
        );

        PendingGroup storage pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.collectedAmount >= _amount, "Cannot cancel deposit from group which has started staking.");

        // cancel user deposit
        deposits.cancelDeposit(_groupId, msg.sender, _recipient, _amount);

        // update group progress
        pendingGroup.collectedAmount = (pendingGroup.collectedAmount).sub(_amount);

        // transfer canceled amount to the recipient
        _recipient.sendValue(_amount);
    }

    /**
    * Function for registering validators for the groups which are ready to start staking.
    * @param _pubKey - BLS public key of the validator, generated by the operator.
    * @param _signature - BLS signature of the validator, generated by the operator.
    * @param _depositDataRoot - hash tree root of the deposit data, generated by the operator.
    * @param _groupId - ID of the group to register validator for.
    */
    function registerValidator(
        bytes calldata _pubKey,
        bytes calldata _signature,
        bytes32 _depositDataRoot,
        bytes32 _groupId
    )
        external
    {
        require(operators.isOperator(msg.sender), "Permission denied.");

        PendingGroup memory pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.collectedAmount == settings.validatorDepositAmount(), "Invalid validator deposit amount.");

        // set allowance for future transfer
        validatorTransfers.setAllowance(_groupId, pendingGroup.manager);

        // cleanup pending group
        delete pendingGroups[_groupId];

        // register validator
        bytes memory withdrawalCredentials = settings.withdrawalCredentials();
        validatorsRegistry.register(
            _pubKey,
            withdrawalCredentials,
            _groupId,
            pendingGroup.collectedAmount,
            settings.maintainerFee()
        );
        validatorRegistration.deposit.value(pendingGroup.collectedAmount)(
            _pubKey,
            withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * Function for transferring validator ownership to the new group.
    * @param _validatorId - ID of the validator to transfer.
    * @param _validatorReward - validator current reward.
    * @param _groupId - ID of the group to register validator for.
    * @param _managerSignature - ECDSA signature of the previous entity manager if such exists.
    */
    function transferValidator(
        bytes32 _validatorId,
        uint256 _validatorReward,
        bytes32 _groupId,
        bytes calldata _managerSignature
    )
        external
    {
        require(operators.isOperator(msg.sender), "Permission denied.");

        PendingGroup memory pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.collectedAmount == settings.validatorDepositAmount(), "Invalid validator deposit amount.");

        (uint256 depositAmount, uint256 prevMaintainerFee, bytes32 prevEntityId) = validatorsRegistry.validators(_validatorId);
        require(validatorTransfers.checkAllowance(prevEntityId, _managerSignature), "Validator transfer is not allowed.");

        (uint256 prevUserDebt, uint256 prevMaintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);

        // set allowance for future transfer
        validatorTransfers.setAllowance(_groupId, pendingGroup.manager);

        // cleanup pending group
        delete pendingGroups[_groupId];

        // transfer validator to the new group
        validatorsRegistry.update(_validatorId, _groupId, settings.maintainerFee());

        uint256 prevEntityReward = _validatorReward.sub(prevUserDebt).sub(prevMaintainerDebt);
        uint256 maintainerDebt = (prevEntityReward.mul(prevMaintainerFee)).div(10000);
        validatorTransfers.registerTransfer.value(depositAmount)(
            _validatorId,
            prevEntityId,
            prevEntityReward.sub(maintainerDebt),
            maintainerDebt
        );
    }
}
