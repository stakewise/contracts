// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../libraries/Roles.sol";
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
        require(isAdmin(msg.sender), "Admins: caller does not have an admin role");
        _;
    }

    /**
     * @dev See {IAdmins-initialize}.
     */
    function initialize(address _admin) public override initializer {
        _addAdmin(_admin);
    }

    /**
     * @dev See {IAdmins-isAdmin}.
     */
    function isAdmin(address _account) public override view returns (bool) {
        return admins.has(_account);
    }

    /**
     * @dev See {IAdmins-addAdmin}.
     */
    function addAdmin(address _account) external override onlyAdmin {
        _addAdmin(_account);
    }

    /**
     * @dev See {IAdmins-renounceAdmin}.
     */
    function renounceAdmin() external override onlyAdmin {
        admins.remove(msg.sender);
        emit AdminRemoved(msg.sender);
    }

    /**
    * @dev Private function for assigning an admin role to the account.
    * @param _account - account to assign an admin role to.
    */
    function _addAdmin(address _account) private {
        admins.add(_account);
        emit AdminAdded(_account);
    }
}
