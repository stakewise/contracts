// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;


/**
 * @dev Interface of the WhiteListManager contract.
 */
interface IWhiteListManager {
    /**
    * @dev Event for tracking added managers.
    * @param account - address of added manager.
    */
    event ManagerAdded(address account);

    /**
    * @dev Event for tracking removed managers.
    * @param account - address of removed manager.
    */
    event ManagerRemoved(address account);

    /**
    * @dev Event for tracking white list updates.
    * @param account - address of the updated account.
    * @param approved - defines whether account is approved or not.
    */
    event WhiteListUpdated(address indexed account, bool approved);

    /**
    * @dev Function for checking whether account is whitelisted.
    * @param account - address of the account to check.
    */
    function whitelistedAccounts(address account) external view returns (bool);

    /**
    * @dev Constructor for initializing the WhiteListManager contract.
    * @param admin - address of the contract admin.
    */
    function initialize(address admin) external;

    /**
    * @dev Function for updating white listed accounts.
    * @param account - account to update.
    * @param approved - defines whether account is approved or not.
    */
    function updateWhiteList(address account, bool approved) external;

    /**
    * @dev Function for checking whether an account has a manager role.
    * @param account - account to check.
    */
    function isManager(address account) external view returns (bool);

    /**
    * @dev Function for assigning manager role to the account.
    * Can only be called by an account with an admin role.
    * @param account - account to assign a manager role to.
    */
    function addManager(address account) external;

    /**
    * @dev Function for removing manager role from the account.
    * Can only be called by an account with an admin role.
    * @param account - account to remove a manager role from.
    */
    function removeManager(address account) external;
}
