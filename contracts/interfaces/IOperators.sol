// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the Operators contract.
 */
interface IOperators {
    /**
    * @dev Event for tracking added operators.
    * @param account - address which was assigned operator role.
    */
    event OperatorAdded(address account);

    /**
    * @dev Event for tracking removed operators.
    * @param account - address which was removed operator role.
    */
    event OperatorRemoved(address account);

    /**
    * @dev Constructor for initializing the Operators contract.
    * @param _admins - address of the Admins contract.
    */
    function initialize(address _admins) external;

    /**
    * @dev Function for checking whether an account has an operator role.
    * @param _account - account to check.
    */
    function isOperator(address _account) external view returns (bool);

    /**
    * @dev Function for adding an operator role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign an operator role to.
    */
    function addOperator(address _account) external;

    /**
    * @dev Function for removing an operator role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove an operator role from.
    */
    function removeOperator(address _account) external;
}
