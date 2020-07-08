// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.5.17;

/**
 * @dev Interface of the Admins contract.
 */
interface IAdmins {
    /**
    * @dev Event for tracking added admins.
    * @param account - An address of the account which was assigned an admin role.
    */
    event AdminAdded(address account);

    /**
    * @dev Event for tracking removed admins.
    * @param account - An address of the account which was removed an admin role.
    */
    event AdminRemoved(address account);

    /**
    * @dev Constructor for initializing the Admins contract.
    * @param admin - The first account to assign the admin role.
    */
    function initialize(address admin) public;

    /**
    * @dev Function for checking whether an account has an admin role.
    * @param account - The account to check.
    */
    function isAdmin(address account) public view returns (bool);

    /**
    * @dev Function for assigning an admin role to the account.
    * Can only be called by an account with an admin role.
    * @param account - The account to assign an admin role to.
    */
    function addAdmin(address account) external;

    /**
    * @dev Function for renouncing an admin role from the account.
    * Account can only renounce himself from having an admin role.
    */
    function renounceAdmin() external;
}
