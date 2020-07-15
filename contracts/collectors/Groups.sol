// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Counters.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IManagers.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IValidatorTransfers.sol";
import "../interfaces/IDeposits.sol";

/**
 * @title Groups
 *
 * @dev Users can create groups and invite other users to stake together.
 * The group creator can optionally provide a validator withdrawal key.
 * The validator can be registered for the group as soon as it collects the validator deposit amount.
 */
contract Groups is Initializable {
    using Address for address payable;
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    /**
    * @dev Structure for storing information about the group which was not yet sent for staking.
    * @param collectedAmount - total amount collected by the group members.
    * @param withdrawalCredentials - withdrawal credentials of the validator provided by group manager.
    * @param members - mapping for user memberships in a group.
    */
    struct PendingGroup {
        uint256 collectedAmount;
        bytes withdrawalCredentials;
        mapping(address => bool) members;
    }

    // @dev Maps IDs of the groups which were not yet sent for staking to the information about them.
    mapping(bytes32 => PendingGroup) public pendingGroups;

    // @dev Total number of groups created.
    Counters.Counter private groupsCounter;

    // @dev Address of the Deposits contract.
    IDeposits private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Address of the Validator Transfers contract.
    IValidatorTransfers private validatorTransfers;

    /**
    * @dev Event for tracking new groups.
    * @param manager - address of the group manager.
    * @param groupId - ID of the created group.
    * @param members - list of group members.
    */
    event GroupCreated(address manager, bytes32 groupId, address[] members);

    /**
    * @dev Event for tracking group own withdrawal public key.
    * @param entityId - ID of the group the key belongs to.
    * @param withdrawalPublicKey - BLS public key to use for the validator withdrawal, submitted by the group creator.
    * @param withdrawalCredentials - withdrawal credentials based on submitted BLS public key.
    */
    event WithdrawalKeyAdded(
        bytes32 indexed entityId,
        bytes withdrawalPublicKey,
        bytes withdrawalCredentials
    );

    /**
    * @dev Constructor for initializing the Groups contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _managers - address of the Managers contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
    */
    function initialize(
        IDeposits _deposits,
        ISettings _settings,
        IManagers _managers,
        IOperators _operators,
        IValidatorRegistration _validatorRegistration,
        IValidators _validators,
        IValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        deposits = _deposits;
        settings = _settings;
        managers = _managers;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validators = _validators;
        validatorTransfers = _validatorTransfers;
    }

    /**
    * @dev Function for creating new groups.
    * It will not be possible to create new groups in case `Groups` contract is paused in `Settings` contract.
    * @param _members - list of group members. Only addresses in the list and the group creator will be able to deposit in the group.
    */
    function createGroup(address[] calldata _members) external {
        require(!settings.pausedContracts(address(this)), "Groups creation is currently disabled.");
        require(_members.length > 0, "The group members list cannot be empty.");

        // create new group
        groupsCounter.increment();
        bytes32 groupId = keccak256(abi.encodePacked(address(this), groupsCounter.current()));
        PendingGroup storage pendingGroup = pendingGroups[groupId];

        // register group members
        for (uint i = 0; i < _members.length; i++) {
            pendingGroup.members[_members[i]] = true;
        }
        pendingGroup.members[msg.sender] = true;

        // register transfer manager for the group
        managers.addTransferManager(groupId, msg.sender);

        // emit event
        emit GroupCreated(msg.sender, groupId, _members);
    }

    /**
    * @dev Function for creating new private groups.
    * It will not be possible to create new groups in case `Groups` contract is paused in `Settings` contract.
    * @param _members - list of group members. Only addresses in the list and the group creator will be able to deposit in the group.
    * @param _publicKey - BLS public key for performing validator withdrawal.
    */
    function createPrivateGroup(address[] calldata _members, bytes calldata _publicKey) external {
        require(_publicKey.length == 48, "Invalid BLS withdrawal public key.");
        require(!settings.pausedContracts(address(this)), "Private groups creation is currently disabled.");
        require(_members.length > 0, "The group members list cannot be empty.");

        // create new group
        groupsCounter.increment();
        bytes32 groupId = keccak256(abi.encodePacked(address(this), groupsCounter.current()));
        PendingGroup storage pendingGroup = pendingGroups[groupId];

        // register group members
        for (uint i = 0; i < _members.length; i++) {
            pendingGroup.members[_members[i]] = true;
        }
        pendingGroup.members[msg.sender] = true;

        // calculate withdrawal credentials
        bytes memory withdrawalCredentials = abi.encodePacked(sha256(_publicKey));

        // set withdrawal prefix
        withdrawalCredentials[0] = 0x00;
        pendingGroup.withdrawalCredentials = withdrawalCredentials;

        // register wallet manager for the group
        managers.addWalletManager(groupId, msg.sender);

        // emit events
        emit GroupCreated(msg.sender, groupId, _members);
        emit WithdrawalKeyAdded(groupId, _publicKey, withdrawalCredentials);
    }

    /**
    * @dev Function for adding deposits in groups. The depositing will be disallowed in case
    * `Groups` contract is paused in `Settings` contract.
    * @param _groupId - ID of the group the user would like to deposit to.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function addDeposit(bytes32 _groupId, address _recipient) external payable {
        require(_recipient != address(0), "Invalid recipient address.");
        require(msg.value > 0 && (msg.value).mod(settings.userDepositMinUnit()) == 0, "Invalid deposit amount.");
        require(!settings.pausedContracts(address(this)), "Depositing is currently disabled.");

        PendingGroup storage pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.members[msg.sender], "The sender is not a member or a manager of the group.");

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
    * @dev Function for canceling deposits in groups.
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
    * @dev Function for registering validators for the groups which are ready to start staking.
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

        bytes memory withdrawalCredentials = pendingGroup.withdrawalCredentials;
        uint256 maintainerFee;
        if (withdrawalCredentials.length == 0) {
            // allow transfer for not private groups
            withdrawalCredentials = settings.withdrawalCredentials();
            validatorTransfers.allowTransfer(_groupId);

            // set maintainer fee for not private groups
            maintainerFee = settings.maintainerFee();
        }

        // cleanup pending group
        delete pendingGroups[_groupId];

        // register validator
        validators.register(
            _pubKey,
            withdrawalCredentials,
            _groupId,
            pendingGroup.collectedAmount,
            maintainerFee
        );
        validatorRegistration.deposit{value: pendingGroup.collectedAmount}(
            _pubKey,
            withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * @dev Function for transferring validator ownership to the new group.
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
        require(pendingGroup.withdrawalCredentials.length == 0, "Cannot transfer to the private group.");

        (, uint256 prevMaintainerFee, bytes32 prevEntityId,) = validators.validators(_validatorId);
        require(managers.canTransferValidator(prevEntityId, _managerSignature), "Invalid transfer manager signature.");
        require(validatorTransfers.checkTransferAllowed(prevEntityId), "Validator transfer is not allowed.");

        // calculate previous entity reward and fee
        (uint256 prevUserDebt, uint256 prevMaintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);
        uint256 prevEntityReward = _validatorReward.sub(prevUserDebt).sub(prevMaintainerDebt);
        uint256 maintainerDebt = (prevEntityReward.mul(prevMaintainerFee)).div(10000);

        // allow transfer for the new entity
        validatorTransfers.allowTransfer(_groupId);

        // cleanup pending group
        delete pendingGroups[_groupId];

        // reassign validator to the new group
        validators.update(_validatorId, _groupId, settings.maintainerFee());

        // register validator transfer
        validatorTransfers.registerTransfer{value: pendingGroup.collectedAmount}(
            _validatorId,
            prevEntityId,
            prevEntityReward.sub(maintainerDebt),
            maintainerDebt
        );
    }
}
