// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../libraries/Roles.sol";
import "../interfaces/IAdmins.sol";
import "../interfaces/IManagers.sol";

/**
 * @title Managers
 *
 * @dev Contract for assigning managers.
 * Managers are responsible for withdrawing validator payments.
 */
contract Managers is IManagers, Initializable {
    using Roles for Roles.Role;

    // @dev Stores managers and defines functions for adding/removing them.
    Roles.Role private managers;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    /**
     * @dev See {IManagers-initialize}.
     */
    function initialize(address _admins) public override initializer {
        admins = IAdmins(_admins);
    }

    /**
     * @dev See {IManagers-isManager}.
     */
    function isManager(address _account) public override view returns (bool) {
        return managers.has(_account);
    }

    /**
     * @dev See {IManagers-addManager}.
     */
    function addManager(address _account) external override {
        require(admins.isAdmin(msg.sender), "Managers: only admin users can assign managers");
        managers.add(_account);
        emit ManagerAdded(_account);
    }

    /**
     * @dev See {IManagers-removeManager}.
     */
    function removeManager(address _account) external override {
        require(admins.isAdmin(msg.sender), "Managers: only admin users can remove managers");
        managers.remove(_account);
        emit ManagerRemoved(_account);
    }
}
