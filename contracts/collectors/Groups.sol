// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Counters.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IValidatorRegistration.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IPayments.sol";

/**
 * @title Groups
 *
 * @dev Users can create groups and invite other users to stake together.
 * The group creator provides a validator withdrawal key.
 * The validator can be registered for the group as soon as it collects the validator deposit amount.
 */
contract Groups is Initializable {
    using Address for address payable;
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    /**
    * @dev Structure for storing information about the group which was not yet sent for staking.
    * @param collectedAmount - total amount collected by the group members.
    * @param payments - address of the payments contract for the validator.
    * @param withdrawalCredentials - withdrawal credentials of the validator provided by group creator.
    * @param members - mapping for user memberships in a group.
    */
    struct PendingGroup {
        uint256 collectedAmount;
        address payments;
        bytes withdrawalCredentials;
        mapping(address => bool) members;
    }

    // @dev Maps IDs of the groups which were not yet sent for staking to the information about them.
    mapping(bytes32 => PendingGroup) public pendingGroups;

    // @dev Total number of groups created.
    Counters.Counter private groupsCounter;

    // @dev Mapping between deposit ID (hash of group ID, sender) and the amount.
    mapping(bytes32 => uint256) private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the VRC (deployed by Ethereum).
    IValidatorRegistration private validatorRegistration;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Address of the payments logical contract.
    address private paymentsImplementation;

    // @dev Payments initialization data for proxy creation.
    bytes private paymentsInitData;

    /**
    * @dev Event for tracking new groups.
    * @param groupId - ID of the created group.
    * @param creator - address of the group creator.
    * @param payments - address of the payments contract.
    * @param withdrawalPublicKey - BLS public key to use for the validator withdrawal, submitted by the group creator.
    * @param withdrawalCredentials - withdrawal credentials based on submitted BLS public key.
    * @param members - list of group members.
    */
    event GroupCreated(
        bytes32 indexed groupId,
        address creator,
        address payments,
        bytes withdrawalPublicKey,
        bytes withdrawalCredentials,
        address[] members
    );

    /**
    * @dev Event for tracking added deposits.
    * @param groupId - ID of the group, the deposit was added to.
    * @param sender - address of the deposit sender.
    * @param amount - amount deposited.
    */
    event DepositAdded(
        bytes32 indexed groupId,
        address sender,
        uint256 amount
    );

    /**
    * @dev Event for tracking canceled deposits.
    * @param groupId - ID of the group, the deposit was canceled in.
    * @param sender - address of the deposit sender.
    * @param amount - amount canceled.
    */
    event DepositCanceled(
        bytes32 indexed groupId,
        address sender,
        uint256 amount
    );

    /**
    * @dev Constructor for initializing the Groups contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    * @param _paymentsImplementation - address of the payments logical contract.
    * @param _paymentsInitData - initialization data for payments proxy creation.
    */
    function initialize(
        ISettings _settings,
        IOperators _operators,
        IValidatorRegistration _validatorRegistration,
        IValidators _validators,
        address _paymentsImplementation,
        bytes memory _paymentsInitData
    )
        public initializer
    {
        settings = _settings;
        operators = _operators;
        validatorRegistration = _validatorRegistration;
        validators = _validators;
        paymentsImplementation = _paymentsImplementation;
        paymentsInitData = _paymentsInitData;
    }

    /**
    * @dev Function for creating new groups.
    * It will not be possible to create new groups in case `Groups` contract is paused in `Settings` contract.
    * @param _members - list of group members. Only addresses in the list and the group creator will be able to deposit in the group.
    * @param _publicKey - BLS public key for performing validator withdrawal.
    */
    function createGroup(address[] calldata _members, bytes calldata _publicKey) external {
        require(_publicKey.length == 48, "Groups: invalid BLS withdrawal public key");
        require(_members.length > 0, "Groups: members list cannot be empty");
        require(!settings.pausedContracts(address(this)), "Groups: contract is paused");

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

        // deploy payments contract for new group
        pendingGroup.payments = deployPayments();

        // emit event
        emit GroupCreated(groupId, msg.sender, pendingGroup.payments, _publicKey, withdrawalCredentials, _members);
    }

    /**
    * @dev Function for retrieving user deposit.
    * @param _groupId - ID of the group, the deposit was sent to.
    * @param _sender - address of the deposit sender.
    */
    function depositOf(bytes32 _groupId, address _sender) public view returns (uint256) {
        return deposits[keccak256(abi.encodePacked(_groupId, _sender))];
    }

    /**
    * @dev Function for adding deposits to groups.
    * The depositing will be disallowed in case `Groups` contract is paused in `Settings` contract.
    * @param _groupId - ID of the group the user would like to deposit to.
    */
    function addDeposit(bytes32 _groupId) external payable {
        require(msg.value > 0 && msg.value.mod(settings.minDepositUnit()) == 0, "Groups: invalid deposit amount");
        require(!settings.pausedContracts(address(this)), "Groups: contract is paused");

        PendingGroup storage pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.members[msg.sender], "Groups: sender is not a member or the group");

        require(
            (pendingGroup.collectedAmount).add(msg.value) <= settings.validatorDepositAmount(),
            "Groups: deposit amount is bigger than amount required to collect"
        );

        // add deposit
        bytes32 depositId = keccak256(abi.encodePacked(_groupId, msg.sender));
        deposits[depositId] = deposits[depositId].add(msg.value);
        emit DepositAdded(_groupId, msg.sender, msg.value);

        // update group progress
        pendingGroup.collectedAmount = pendingGroup.collectedAmount.add(msg.value);
    }

    /**
    * @dev Function for canceling deposits in groups.
    * @param _groupId - ID of the group the deposit was added to.
    * @param _amount - amount to cancel from the deposit.
    */
    function cancelDeposit(bytes32 _groupId, uint256 _amount) external {
        require(_amount > 0 && _amount.mod(settings.minDepositUnit()) == 0, "Groups: invalid deposit cancel amount");

        // cancel user deposit
        bytes32 depositId = keccak256(abi.encodePacked(_groupId, msg.sender));
        deposits[depositId] = deposits[depositId].sub(_amount, "Groups: deposit cancel amount exceeds balance");

        // update group progress
        PendingGroup storage pendingGroup = pendingGroups[_groupId];
        pendingGroup.collectedAmount = pendingGroup.collectedAmount.sub(_amount, "Groups: invalid group ID");

        // emit event
        emit DepositCanceled(_groupId, msg.sender, _amount);

        // transfer canceled amount to the sender
        msg.sender.sendValue(_amount);
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
        require(operators.isOperator(msg.sender), "Groups: permission denied");

        PendingGroup memory pendingGroup = pendingGroups[_groupId];
        require(pendingGroup.collectedAmount == settings.validatorDepositAmount(), "Groups: invalid group ID");

        // enable metering for the validator
        IPayments(pendingGroup.payments).startMeteringValidator(keccak256(abi.encodePacked(_pubKey)));

        // cleanup pending group
        delete pendingGroups[_groupId];

        // register validator
        validators.register(_pubKey, _groupId);
        validatorRegistration.deposit{value: pendingGroup.collectedAmount}(
            _pubKey,
            pendingGroup.withdrawalCredentials,
            _signature,
            _depositDataRoot
        );
    }

    /**
    * @dev Function for deploying payments proxy contract.
    */
    function deployPayments() private returns (address proxy) {
        // Adapted from https://github.com/OpenZeppelin/openzeppelin-sdk/blob/v2.8.2/packages/lib/contracts/upgradeability/ProxyFactory.sol#L18
        bytes20 targetBytes = bytes20(paymentsImplementation);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            proxy := create(0, clone, 0x37)
        }
        // solhint-disable-next-line avoid-low-level-calls
        (bool success,) = proxy.call(paymentsInitData);
        require(success);
    }
}
