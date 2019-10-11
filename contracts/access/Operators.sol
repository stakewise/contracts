pragma solidity 0.5.12;

import "@openzeppelin/contracts/access/Roles.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./Admins.sol";

/**
 * @title Operators
 * Contract for adding/removing operator roles.
 * Operators are responsible for registering and starting validators.
 */
contract Operators is Initializable {
    using Roles for Roles.Role;

    // Stores operators and defines functions for adding/removing them.
    Roles.Role private operators;

    // Address of the Admins contract.
    Admins private admins;

    /**
    * Event for tracking added operators.
    * @param account - An address of the account which was assigned an operator role.
    * @param issuer - An address of the account which assigned an operator role.
    */
    event OperatorAdded(address indexed account, address indexed issuer);

    /**
    * Event for tracking removed operators.
    * @param account - An address of the account which was removed an operator role.
    * @param issuer - An address of the account which removed an operator role.
    */
    event OperatorRemoved(address indexed account, address indexed issuer);

    /**
    * Constructor for initializing the Operators contract.
    * @param _admins - An address of the Admins contract.
    */
    function initialize(Admins _admins) public initializer {
        admins = _admins;
    }

    /**
    * Function for checking whether an account has an operator role.
    * @param account - the account to check.
    */
    function isOperator(address account) public view returns (bool) {
        return operators.has(account);
    }

    /**
    * Function for adding an operator role to the account.
    * Can only be called by an admin account.
    * @param account - the account to assign an operator role to.
    */
    function addOperator(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can assign operators.");
        operators.add(account);
        emit OperatorAdded(account, msg.sender);
    }

    /**
    * Function for removing an operator role from the account.
    * Can only be called by an admin account.
    * @param account - the account to remove an operator role from.
    */
    function removeOperator(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can remove operators.");
        operators.remove(account);
        emit OperatorRemoved(account, msg.sender);
    }
}
