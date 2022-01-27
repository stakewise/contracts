// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IWhiteListManager.sol";

/**
 * @title WhiteListManager
 *
 * @dev WhiteListManager contract stores accounts that can stake and transfer tokens.
 * Only managers can update whitelisted accounts. The manager role is assigned and revoked by admins.
 */
contract WhiteListManager is IWhiteListManager, OwnablePausableUpgradeable  {
    // @dev Accounts with manager role can whitelist accounts.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    // @dev Defines whitelisted accounts.
    mapping(address => bool) public override whitelistedAccounts;

    /**
    * @dev See {IWhiteListManager-initialize}.
    */
    function initialize(address admin) external override initializer {
        require(admin != address(0), "WhiteListManager: invalid admin address");

        // initialize admin
        __OwnablePausableUpgradeable_init(admin);

        // grant manager role to the admin, so it could whitelist accounts.
        _setupRole(MANAGER_ROLE, admin);
        emit ManagerAdded(admin);
    }

    /**
    * @dev Modifier for checking whether the caller is a manager.
    */
    modifier onlyManager() {
        require(hasRole(MANAGER_ROLE, msg.sender), "WhiteListManager: access denied");
        _;
    }

    /**
     * @dev See {IWhiteListManager-updateWhiteList}.
     */
    function updateWhiteList(address account, bool approved) external override onlyManager whenNotPaused {
        require(account != address(0), "WhiteListManager: invalid account address");
        whitelistedAccounts[account] = approved;
        emit WhiteListUpdated(account, approved);
    }

    /**
     * @dev See {IWhiteListManager-isManager}.
     */
    function isManager(address account) external override view returns (bool) {
        return hasRole(MANAGER_ROLE, account);
    }

    /**
     * @dev See {IWhiteListManager-addManager}.
     */
    function addManager(address account) external override {
        require(account != address(0), "WhiteListManager: invalid account address");
        grantRole(MANAGER_ROLE, account);
        emit ManagerAdded(account);
    }

    /**
     * @dev See {IWhiteListManager-removeManager}.
     */
    function removeManager(address account) external override {
        require(account != address(0), "WhiteListManager: invalid account address");
        revokeRole(MANAGER_ROLE, account);
        emit ManagerRemoved(account);
    }
}
