// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Roles.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IAdmins.sol";

/**
 * @title Admins
 *
 * @dev Contract for adding/renouncing admin roles.
 * Admin users can change global settings, assign/remove operators and managers.
 */
contract Admins is IAdmins, Initializable {
    using Roles for Roles.Role;

    // @dev Stores admins and defines functions for adding/removing them.
    Roles.Role private admins;

    /**
    * @dev Modifier for checking whether the caller has an admin role.
    */
    modifier onlyAdmin() {
        require(isAdmin(msg.sender), "Caller does not have an Admin role.");
        _;
    }

    /**
     * @dev See {IAdmins-initialize}.
     */
    function initialize(address admin) public initializer {
        _addAdmin(admin);
    }

    /**
     * @dev See {IAdmins-isAdmin}.
     */
    function isAdmin(address account) public view returns (bool) {
        return admins.has(account);
    }

    /**
     * @dev See {IAdmins-addAdmin}.
     */
    function addAdmin(address account) external onlyAdmin {
        _addAdmin(account);
    }

    /**
     * @dev See {IAdmins-renounceAdmin}.
     */
    function renounceAdmin() external onlyAdmin {
        admins.remove(msg.sender);
        emit AdminRemoved(msg.sender);
    }

    /**
    * @dev Private function for assigning an admin role to the account.
    * @param account - the account to assign an admin role to.
    */
    function _addAdmin(address account) private {
        admins.add(account);
        emit AdminAdded(account);
    }
}
