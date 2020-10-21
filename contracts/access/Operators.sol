// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../libraries/Roles.sol";
import "../interfaces/IAdmins.sol";
import "../interfaces/IOperators.sol";

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
    function initialize(address _admins) public override initializer {
        admins = IAdmins(_admins);
    }

    /**
     * @dev See {IOperators-isOperator}.
     */
    function isOperator(address _account) public override view returns (bool) {
        return operators.has(_account);
    }

    /**
     * @dev See {IOperators-addOperator}.
     */
    function addOperator(address _account) external override {
        require(admins.isAdmin(msg.sender), "Operators: only admin users can assign operators");
        operators.add(_account);
        emit OperatorAdded(_account);
    }

    /**
     * @dev See {IOperators-removeOperator}.
     */
    function removeOperator(address _account) external override {
        require(admins.isAdmin(msg.sender), "Operators: only admin users can remove operators");
        operators.remove(_account);
        emit OperatorRemoved(_account);
    }
}
