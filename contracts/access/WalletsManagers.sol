pragma solidity 0.5.16;

import "@openzeppelin/contracts/access/Roles.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./Admins.sol";

/**
 * @title WalletsManagers
 * Contract for adding/removing manager roles.
 * Managers are responsible for allocating wallets for finished validators and enabling withdrawals.
 */
contract WalletsManagers is Initializable {
    using Roles for Roles.Role;

    // Stores managers and defines functions for adding/removing them.
    Roles.Role private managers;

    // Address of the Admins contract.
    Admins private admins;

    /**
    * Event for tracking added managers.
    * @param account - An address of the account which was assigned a manager role.
    * @param issuer - An address of the admin account which assigned a manager role.
    */
    event ManagerAdded(address account, address indexed issuer);

    /**
    * Event for tracking removed managers.
    * @param account - An address of the account which was removed a manager role.
    * @param issuer - An address of the admin account which removed a manager role.
    */
    event ManagerRemoved(address account, address indexed issuer);

    /**
    * Constructor for initializing the WalletsManagers contract.
    * @param _admins - An address of the Admins contract.
    */
    function initialize(Admins _admins) public initializer {
        admins = _admins;
    }

    /**
    * Function for checking whether an account has a manager role.
    * @param account - the account to check.
    */
    function isManager(address account) public view returns (bool) {
        return managers.has(account);
    }

    /**
    * Function for adding a manager role to the account.
    * Can only be called by an admin account.
    * @param account - the account to assign a manager role to.
    */
    function addManager(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can assign managers.");
        managers.add(account);
        emit ManagerAdded(account, msg.sender);
    }

    /**
    * Function for removing a manager role from the account.
    * Can only be called by an admin account.
    * @param account - the account to remove a manager role from.
    */
    function removeManager(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can remove managers.");
        managers.remove(account);
        emit ManagerRemoved(account, msg.sender);
    }
}
