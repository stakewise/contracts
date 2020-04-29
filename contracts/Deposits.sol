pragma solidity 0.5.17;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";
import "./collectors/Individuals.sol";
import "./collectors/Pools.sol";
import "./collectors/Groups.sol";

/**
 * @title Deposits
 * Contract for keeping track of deposits from all the collectors.
 * Can only be modified by collectors.
 */
contract Deposits is Initializable {
    // mapping between user ID (hash of entity ID, sender, recipient) and the amount.
    mapping(bytes32 => uint256) public amounts;

    // address of the Pools contract.
    Pools private pools;

    // address of the Individuals contract.
    Individuals private individuals;

    // address of the Groups contract.
    Groups private groups;

    /**
    * Event for tracking added deposits.
    * @param collector - address of the collector, the deposit was received from.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param sender - address of the deposit sender.
    * @param recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    * @param amount - amount deposited.
    */
    event DepositAdded(
        address collector,
        bytes32 entityId,
        address sender,
        address recipient,
        uint256 amount
    );

    /**
    * Event for tracking canceled deposits.
    * @param collector - address of the collector, the deposit was canceled from.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param sender - address of the deposit sender.
    * @param recipient - address where canceled deposit will be sent.
    * @param amount - amount canceled.
    */
    event DepositCanceled(
        address collector,
        bytes32 entityId,
        address sender,
        address recipient,
        uint256 amount
    );

    /**
    * Constructor for initializing the Deposits contract.
    * @param _pools - address of the Pools contract.
    * @param _individuals - address of the Individuals contract.
    * @param _groups - address of the Groups contract.
    */
    function initialize(Pools _pools, Individuals _individuals, Groups _groups) public initializer {
        pools = _pools;
        individuals = _individuals;
        groups = _groups;
    }

    /**
    * Function for retrieving user deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function getDeposit(bytes32 _entityId, address _sender, address _recipient) public view returns (uint256) {
        return amounts[keccak256(abi.encodePacked(_entityId, _sender, _recipient))];
    }

    /**
    * Function for adding deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    * @param _amount - amount deposited.
    */
    function addDeposit(
        bytes32 _entityId,
        address _sender,
        address _recipient,
        uint256 _amount
    )
        external
    {
        require(msg.sender == address(pools) || msg.sender == address(individuals) || msg.sender == address(groups), "Permission denied.");
        amounts[keccak256(abi.encodePacked(_entityId, _sender, _recipient))] += _amount;
        emit DepositAdded(msg.sender, _entityId, _sender, _recipient, _amount);
    }

    /**
    * Function for canceling deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where canceled deposit amount will be sent.
    * @param _amount - amount canceled.
    */
    function cancelDeposit(
        bytes32 _entityId,
        address _sender,
        address _recipient,
        uint256 _amount

    )
        external
    {
        require(msg.sender == address(pools) || msg.sender == address(individuals) || msg.sender == address(groups), "Permission denied.");
        amounts[keccak256(abi.encodePacked(_entityId, _sender, _recipient))] -= _amount;
        emit DepositCanceled(msg.sender, _entityId, _sender, _recipient, _amount);
    }
}
