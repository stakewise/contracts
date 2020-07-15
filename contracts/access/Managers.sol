// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../libraries/Roles.sol";
import "../interfaces/IAdmins.sol";
import "../interfaces/IManagers.sol";

/**
 * @title Managers
 *
 * @dev Contract for assigning managers.
 * Managers are responsible for requesting validator transfers, assigning withdrawal wallets.
 */
contract Managers is IManagers, Initializable {
    using ECDSA for bytes32;
    using Roles for Roles.Role;

    // @dev Mapping between the entity ID and its wallet manager.
    mapping(bytes32 => address) public override walletManagers;

    // @dev Stores managers and defines functions for adding/removing them.
    Roles.Role private managers;

    // @dev Mapping between the entity ID and its transfer manager.
    mapping(bytes32 => address) private transferManagers;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Address of the Groups contract.
    address private groups;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Checks whether the caller is the collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == groups ||
            msg.sender == solos,
            "Permission denied."
        );
        _;
    }

    /**
     * @dev See {IManagers-initialize}.
     */
    function initialize(address _solos, address _groups, address _admins) public override initializer {
        solos = _solos;
        groups = _groups;
        admins = IAdmins(_admins);
    }

    /**
     * @dev See {IManagers-isManager}.
     */
    function isManager(address _account) public override view returns (bool) {
        return managers.has(_account);
    }

    /**
     * @dev See {IManagers-canTransferValidator}.
     */
    function canTransferValidator(bytes32 _entityId, bytes calldata _signature) external override view returns (bool) {
        address manager = transferManagers[_entityId];
        if (manager != address(0)) {
            bytes32 hash = keccak256(abi.encodePacked("validatortransfer", _entityId));
            return manager == hash.toEthSignedMessageHash().recover(_signature);
        }
        return true;
    }

    /**
     * @dev See {IManagers-canManageWallet}.
     */
    function canManageWallet(bytes32 _entityId, address _account) external override view returns (bool) {
        address manager = walletManagers[_entityId];
        if (manager != address(0)) {
            return manager == _account;
        }
        return isManager(_account);
    }

    /**
     * @dev See {IManagers-addTransferManager}.
     */
    function addTransferManager(bytes32 _entityId, address _account) external override onlyCollectors {
        transferManagers[_entityId] = _account;
    }

    /**
     * @dev See {IManagers-addWalletManager}.
     */
    function addWalletManager(bytes32 _entityId, address _account) external override onlyCollectors {
        walletManagers[_entityId] = _account;
    }

    /**
     * @dev See {IManagers-addManager}.
     */
    function addManager(address _account) external override {
        require(admins.isAdmin(msg.sender), "Only admin users can assign managers.");
        managers.add(_account);
        emit ManagerAdded(_account);
    }

    /**
     * @dev See {IManagers-removeManager}.
     */
    function removeManager(address _account) external override {
        require(admins.isAdmin(msg.sender), "Only admin users can remove managers.");
        managers.remove(_account);
        emit ManagerRemoved(_account);
    }
}
