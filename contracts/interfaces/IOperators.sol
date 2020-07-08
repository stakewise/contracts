// SPDX-License-Identifier: MIT

pragma solidity 0.5.17;

/**
 * @dev Interface of the Operators contract.
 */
interface IOperators {
    /**
    * @dev Event for tracking added operators.
    * @param account - An address of the account which was assigned an operator role.
    * @param issuer - An address of the account which assigned an operator role.
    */
    event OperatorAdded(address account, address indexed issuer);

    /**
    * @dev Event for tracking removed operators.
    * @param account - An address of the account which was removed an operator role.
    * @param issuer - An address of the account which removed an operator role.
    */
    event OperatorRemoved(address account, address indexed issuer);

    /**
    * @dev Constructor for initializing the Operators contract.
    * @param _admins - An address of the Admins contract.
    */
    function initialize(address _admins) external;

    /**
    * @dev Function for checking whether an account has an operator role.
    * @param account - The account to check.
    */
    function isOperator(address account) external view returns (bool);

    /**
    * @dev Function for adding an operator role to the account.
    * Can only be called by an account with an admin role.
    * @param account - The account to assign an operator role to.
    */
    function addOperator(address account) external;

    /**
    * @dev Function for removing an operator role from the account.
    * Can only be called by an account with an admin role.
    * @param account - The account to remove an operator role from.
    */
    function removeOperator(address account) external;
}
