// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Roles.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IOperators.sol";
import "../interfaces/IAdmins.sol";

/**
 * @title Operators
 *
 * @dev Contract for adding/removing operator roles.
 * Operators are responsible for registering and starting validators.
 */
contract Operators is IOperators, Initializable {
    using Roles for Roles.Role;

    // @dev Stores operators and defines functions for adding/removing them.
    Roles.Role private operators;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    /**
     * @dev See {IOperators-initialize}.
     */
    function initialize(address _admins) public initializer {
        admins = IAdmins(_admins);
    }

    /**
     * @dev See {IOperators-isOperator}.
     */
    function isOperator(address account) public view returns (bool) {
        return operators.has(account);
    }

    /**
     * @dev See {IOperators-addOperator}.
     */
    function addOperator(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can assign operators.");
        operators.add(account);
        emit OperatorAdded(account, msg.sender);
    }

    /**
     * @dev See {IOperators-removeOperator}.
     */
    function removeOperator(address account) external {
        require(admins.isAdmin(msg.sender), "Only admin users can remove operators.");
        operators.remove(account);
        emit OperatorRemoved(account, msg.sender);
    }
}
