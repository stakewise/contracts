pragma solidity 0.5.17;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../Deposits.sol";
import "../Settings.sol";
import "./BaseCollector.sol";

/**
 * @title Groups
 * Groups contract allows users to create groups and invite other users to stake together.
 * The group is sent for staking as soon as it collects the validator deposit amount.
 */
contract Groups is BaseCollector {
    /**
    * Structure for storing information about the group.
    * @param collectedAmount - the total amount collected by the group members.
    * @param targetAmountCollected - indicates whether the group has collected the target validator deposit amount.
    */
    struct Group {
        uint256 collectedAmount;
        bool targetAmountCollected;
    }

    // Maps ID of the group to its information.
    mapping(bytes32 => Group) public groups;

    // Indicates whether a user is a member of the group or not.
    mapping(bytes32 => bool) public registeredMembers;

    /**
    * Event for tracking new groups.
    * @param creator - an address of the group creator.
    * @param groupId - an ID of the created group.
    * @param members - a list of group members.
    */
    event GroupCreated(address creator, bytes32 groupId, address[] members);

    /**
    * Constructor for initializing the Groups contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _operators - Address of the Operators contract.
    * @param _validatorRegistration - Address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _validatorTransfers - Address of the Validator Transfers contract.
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
        BaseCollector.initialize(
            _deposits,
            _settings,
            _operators,
            _validatorRegistration,
            _validatorsRegistry,
            _validatorTransfers
        );
    }

    /**
    * Function for creating new groups.
    * It will not be possible to create new groups in case `Groups` collector is paused in the `Settings` contract.
    * @param _members - a list of group members. Only accounts in the list + the group creator can deposit to the group.
    */
    function createGroup(address[] calldata _members) external {
        require(!settings.pausedCollectors(address(this)), "New groups creation is currently disabled.");
        require(_members.length > 0, "The group members list cannot be empty.");

        // register group members
        bytes32 groupId = keccak256(abi.encodePacked(address(this), entitiesCount));
        for (uint i = 0; i < _members.length; i++) {
            registeredMembers[keccak256(abi.encodePacked(groupId, _members[i]))] = true;
        }

        // register sender as a member
        registeredMembers[keccak256(abi.encodePacked(groupId, msg.sender))] = true;

        // Increase entity ID for the next group
        entitiesCount++;

        emit GroupCreated(msg.sender, groupId, _members);
    }

    /**
    * Function for adding deposits to groups.
    * User must transfer ether amount together with calling the function.
    * @param _groupId - an ID of the group the user would like to deposit to.
    * @param _withdrawer - an account where deposit + rewards will be sent after the withdrawal.
    */
    function addDeposit(bytes32 _groupId, address _withdrawer) external payable {
        require(_withdrawer != address(0), "Withdrawer address cannot be zero address.");
        require(msg.value > 0 && msg.value % settings.userDepositMinUnit() == 0, "Invalid deposit amount.");
        require(registeredMembers[keccak256(abi.encodePacked(_groupId, msg.sender))], "The user is not a member of the group with the specified ID.");

        Group storage group = groups[_groupId];
        require(!group.targetAmountCollected, "The group has already collected a validator deposit amount.");

        uint256 validatorDepositAmount = settings.validatorDepositAmount();
        require(group.collectedAmount + msg.value <= validatorDepositAmount, "The deposit amount is bigger than the amount required to collect.");

        // register user deposit
        deposits.addDeposit(_groupId, msg.sender, _withdrawer, msg.value);
        totalSupply += msg.value;

        // update group progress
        group.collectedAmount += msg.value;
        if (group.collectedAmount == validatorDepositAmount) {
            group.targetAmountCollected = true;
            readyEntityIds.push(_groupId);
        }
    }

    /**
    * Function for canceling deposits in groups.
    * The deposits can only be canceled for groups that have not yet accumulated validator deposit amount.
    * @param _groupId - an ID of the group the deposit was added for.
    * @param _withdrawer - an account where the canceled amount will be transferred (must be the same as when the deposit was made).
    * @param _amount - the amount of ether to cancel from the deposit.
    */
    function cancelDeposit(bytes32 _groupId, address payable _withdrawer, uint256 _amount) external {
        require(_amount > 0 && _amount % settings.userDepositMinUnit() == 0, "Invalid deposit cancel amount.");
        require(
            deposits.getDeposit(_groupId, msg.sender, _withdrawer) >= _amount,
            "The user does not have a specified deposit cancel amount."
        );

        Group storage group = groups[_groupId];
        require(!group.targetAmountCollected, "Cannot cancel the deposit amount of the group which has collected a validator deposit amount.");

        deposits.cancelDeposit(_groupId, msg.sender, _withdrawer, _amount);
        totalSupply -= _amount;
        group.collectedAmount -= _amount;

        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success,) = _withdrawer.call.value(_amount)("");
        // solhint-enable avoid-call-value
        require(success, "Transfer has failed.");
    }
}
