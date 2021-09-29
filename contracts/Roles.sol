// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRoles.sol";

/**
 * @title Roles
 *
 * @dev Roles contract assigns roles to the accounts for the rewards distribution.
 */
contract Roles is IRoles, OwnablePausableUpgradeable {
    /**
     * @dev See {IRoles-initialize}.
     */
    function initialize(address admin) external override initializer {
        __OwnablePausableUpgradeable_init(admin);
    }

    /**
     * @dev See {IRoles-setOperator}.
     */
    function setOperator(address account, uint256 revenueShare) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        require(revenueShare <= 1e4, "Roles: invalid revenue share");
        emit OperatorUpdated(account, revenueShare);
    }

    /**
     * @dev See {IRoles-removeOperator}.
     */
    function removeOperator(address account) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        emit OperatorRemoved(account);
    }

    /**
     * @dev See {IRoles-setPartner}.
     */
    function setPartner(address account, uint256 revenueShare) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        require(revenueShare <= 1e4, "Roles: invalid revenue share");
        emit PartnerUpdated(account, revenueShare);
    }

    /**
     * @dev See {IRoles-removePartner}.
     */
    function removePartner(address account) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        emit PartnerRemoved(account);
    }

    /**
     * @dev See {IRoles-addReferrer}.
     */
    function addReferrer(address account) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        emit ReferrerAdded(account);
    }

    /**
     * @dev See {IRoles-removeReferrer}.
     */
    function removeReferrer(address account) external override onlyAdmin whenNotPaused {
        require(account != address(0), "Roles: account is the zero address");
        emit ReferrerRemoved(account);
    }
}
