pragma solidity 0.5.17;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";
import "./collectors/Privates.sol";
import "./collectors/Pools.sol";
import "./collectors/Groups.sol";

/**
 * @title Deposits
 * Contract for keeping track of deposits from all the collectors.
 * Can only be modified by collectors.
 */
contract Deposits is Initializable {
    // A mapping between user ID (hash of entity ID, sender, withdrawer) and the amount.
    mapping(bytes32 => uint256) public amounts;

    // Address of the Pools contract.
    Pools private pools;

    // Address of the Privates contract.
    Privates private privates;

    // Address of the Groups contract.
    Groups private groups;

    /**
    * Event for tracking added deposits.
    * @param collector - an address of the collector, the deposit was received from.
    * @param entityId - an ID of the entity, the deposit was collected in.
    * @param sender - an account which has sent the deposit.
    * @param withdrawer - an account where deposit + rewards will be sent after withdrawal.
    * @param amount - amount deposited (in Wei).
    */
    event DepositAdded(
        address collector,
        bytes32 entityId,
        address sender,
        address withdrawer,
        uint256 amount
    );

    /**
    * Event for tracking canceled deposits.
    * @param collector - an address of the collector, the deposit cancel was received from.
    * @param entityId - an ID of the entity, the deposit was collected in.
    * @param sender - an account which has sent the deposit.
    * @param withdrawer - an account where canceled deposit will be sent.
    * @param amount - amount canceled (in Wei).
    */
    event DepositCanceled(
        address collector,
        bytes32 entityId,
        address sender,
        address withdrawer,
        uint256 amount
    );

    /**
    * Constructor for initializing the Deposits contract.
    * @param _pools - An address of the Pools contract.
    * @param _privates - An address of the Privates contract.
    * @param _groups - An address of the Groups contract.
    */
    function initialize(Pools _pools, Privates _privates, Groups _groups) public initializer {
        pools = _pools;
        privates = _privates;
        groups = _groups;
    }

    /**
    * Function for retrieving user deposit.
    * @param _entityId - an ID of the entity, the deposit belongs to.
    * @param _sender - the address of the deposit sender account.
    * @param _withdrawer - the address of the deposit withdrawer account.
    */
    function getDeposit(bytes32 _entityId, address _sender, address _withdrawer) public view returns (uint256) {
        return amounts[keccak256(abi.encodePacked(_entityId, _sender, _withdrawer))];
    }

    /**
    * Function for adding deposit.
    * @param _entityId - an ID of the entity, the deposit belongs to.
    * @param _sender - the address of the deposit sender account.
    * @param _withdrawer - the address of the deposit withdrawer account.
    * @param _amount - the amount deposited.
    */
    function addDeposit(
        bytes32 _entityId,
        address _sender,
        address _withdrawer,
        uint256 _amount
    )
        external
    {
        require(msg.sender == address(pools) || msg.sender == address(privates) || msg.sender == address(groups), "Permission denied.");
        amounts[keccak256(abi.encodePacked(_entityId, _sender, _withdrawer))] += _amount;
        emit DepositAdded(msg.sender, _entityId, _sender, _withdrawer, _amount);
    }

    /**
    * Function for canceling deposit.
    * @param _entityId - an ID of the entity, the deposit belongs to.
    * @param _sender - the address of the deposit sender account.
    * @param _withdrawer - the address of the deposit withdrawer account.
    * @param _amount - the amount canceled.
    */
    function cancelDeposit(
        bytes32 _entityId,
        address _sender,
        address _withdrawer,
        uint256 _amount

    )
        external
    {
        require(msg.sender == address(pools) || msg.sender == address(groups), "Permission denied.");
        amounts[keccak256(abi.encodePacked(_entityId, _sender, _withdrawer))] -= _amount;
        emit DepositCanceled(msg.sender, _entityId, _sender, _withdrawer, _amount);
    }
}
