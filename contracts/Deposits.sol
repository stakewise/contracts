pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";
import "./collectors/Individuals.sol";
import "./collectors/PrivateIndividuals.sol";
import "./collectors/Pools.sol";
import "./collectors/Groups.sol";

/**
 * @title Deposits
 * Contract for keeping track of deposits from all the collectors.
 * Can only be modified by collectors.
 */
contract Deposits is Initializable {
    using SafeMath for uint256;

    // mapping between user ID (hash of entity ID, sender, recipient) and the amount.
    mapping(bytes32 => uint256) public amounts;

    // address of the Pools contract. TODO: rename to periodicPools
    Pools private pools;

    // address of the Individuals contract.
    Individuals private individuals;

    // address of the PrivateIndividuals contract.
    PrivateIndividuals private privateIndividuals;

    // address of the Groups contract.
    Groups private groups;

    // TODO: move up on contracts redeployment
    // address of the phase 2 Pools contract.
    Pools private phase2Pools;

    // checks whether the caller is the Collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == address(pools) ||
            msg.sender == address(phase2Pools) ||
            msg.sender == address(groups) ||
            msg.sender == address(individuals) ||
            msg.sender == address(privateIndividuals),
            "Permission denied."
        );
        _;
    }

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
    * @param _periodicPools - address of the periodic Pools contract.
    * @param _phase2Pools - address of the phase 2 Pools contract.
    * @param _individuals - address of the Individuals contract.
    * @param _privateIndividuals - address of the PrivateIndividuals contract.
    * @param _groups - address of the Groups contract.
    */
    function initialize(
        Pools _periodicPools,
        Pools _phase2Pools,
        Individuals _individuals,
        PrivateIndividuals _privateIndividuals,
        Groups _groups
    )
        public initializer
    {
        // TODO: rename to periodicPools
        pools = _periodicPools;
        phase2Pools = _phase2Pools;
        individuals = _individuals;
        privateIndividuals = _privateIndividuals;
        groups = _groups;
    }

    /**
    * TODO: remove on contracts redeployment
    */
    function initialize2() public {
        require(address(privateIndividuals) != 0x67249bA45f650afC28521A2e8791aAb6aB2A5a5e);
        privateIndividuals = PrivateIndividuals(0x67249bA45f650afC28521A2e8791aAb6aB2A5a5e);
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
    function addDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external onlyCollectors {
        bytes32 depositId = keccak256(abi.encodePacked(_entityId, _sender, _recipient));
        amounts[depositId] = (amounts[depositId]).add(_amount);
        emit DepositAdded(msg.sender, _entityId, _sender, _recipient, _amount);
    }

    /**
    * Function for canceling deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where canceled deposit amount will be sent.
    * @param _amount - amount canceled.
    */
    function cancelDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external onlyCollectors {
        bytes32 depositId = keccak256(abi.encodePacked(_entityId, _sender, _recipient));
        amounts[depositId] = (amounts[depositId]).sub(_amount);
        emit DepositCanceled(msg.sender, _entityId, _sender, _recipient, _amount);
    }
}
