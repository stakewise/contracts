pragma solidity 0.5.10;

import "@openzeppelin/contracts/access/Roles.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";


/**
 * @title Admins
 * Contract for adding/renouncing admin roles.
 * Admin users can change global settings, assign/remove operators, enable withdrawals.
 */
contract Admins is Initializable {
    using Roles for Roles.Role;

    // Stores admins and defines functions for adding/removing them.
    Roles.Role private admins;

    /**
    * Event for tracking added admins.
    * @param account - An address of the account which was assigned an admin role.
    */
    event AdminAdded(address indexed account);

    /**
    * Event for tracking removed admins.
    * @param account - An address of the account which was removed an admin role.
    */
    event AdminRemoved(address indexed account);

    /**
    * Modifier for checking whether the caller has an admin role.
    */
    modifier onlyAdmin() {
        require(isAdmin(msg.sender), "Caller does not have an Admin role.");
        _;
    }

    /**
    * Constructor for initializing the Admins contract.
    * @param admin - the first account to assign the admin role.
    */
    function initialize(address admin) public initializer {
        _addAdmin(admin);
    }

    /**
    * Function for checking whether an account has an admin role.
    * @param account - the account to check.
    */
    function isAdmin(address account) public view returns (bool) {
        return admins.has(account);
    }

    /**
    * Function for assigning an admin role to the account.
    * Can only be called by an admin account.
    * @param account - the account to assign an admin role to.
    */
    function addAdmin(address account) external onlyAdmin {
        _addAdmin(account);
    }

    /**
    * Function for renouncing an admin role from the account.
    * Account can only renounce himself from having an admin role.
    */
    function renounceAdmin() external onlyAdmin {
        admins.remove(msg.sender);
        emit AdminRemoved(msg.sender);
    }

    /**
    * Private function for assigning an admin role to the account.
    * @param account - the account to assign an admin role to.
    */
    function _addAdmin(address account) private {
        admins.add(account);
        emit AdminAdded(account);
    }
}
