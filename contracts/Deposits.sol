pragma solidity 0.5.10;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";
import "./collectors/Pools.sol";

/**
 * @title Deposits
 * Contract for keeping track of deposits from all the collectors.
 * Can only be modified by collectors.
 */
contract Deposits is Initializable {
    // A mapping between user ID (hash of collector ID, sender address, withdrawer address) and the amount deposited.
    mapping(bytes32 => uint256) public amounts;

    // Address of the Pools contract.
    Pools private pools;

    /**
    * Constructor for initializing the Deposits contract.
    * @param _pools - An address of the Pools contract.
    */
    function initialize(Pools _pools) public initializer {
        pools = _pools;
    }

    /**
    * Function for increasing the deposit amount of the user.
    * @param userId - the ID of the user deposit belongs to.
    * @param amount - the amount to increase for.
    */
    function increaseAmount(bytes32 userId, uint256 amount) external {
        require(msg.sender == address(pools), "Permission denied.");
        amounts[userId] += amount;
    }

    /**
    * Function for decreasing the deposit amount of the user.
    * @param userId - the ID of the user deposit belongs to.
    * @param amount - the amount to decrease for.
    */
    function decreaseAmount(bytes32 userId, uint256 amount) external {
        require(msg.sender == address(pools), "Permission denied.");
        amounts[userId] -= amount;
    }
}
