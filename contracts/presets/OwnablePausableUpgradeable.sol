// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IOwnablePausableUpgradeable.sol";

/**
 * @title OwnablePausableUpgradeable
 *
 * @dev Bundles Access Control, Pausable and Upgradeable contracts in one.
 *
 */
abstract contract OwnablePausableUpgradeable is IOwnablePausableUpgradeable, PausableUpgradeable, AccessControlUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /**
    * @dev Modifier for checking whether the caller is an admin.
    */
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "OwnablePausableUpgradeable: permission denied");
        _;
    }

    /**
    * @dev Modifier for checking whether the caller is a pauser.
    */
    modifier onlyPauser() {
        require(hasRole(PAUSER_ROLE, msg.sender), "OwnablePausableUpgradeable: permission denied");
        _;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __OwnablePausableUpgradeable_init(address _admin) internal initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __Pausable_init_unchained();
        __OwnablePausableUpgradeable_init_unchained(_admin);
    }

    // solhint-disable-next-line func-name-mixedcase
    function __OwnablePausableUpgradeable_init_unchained(address _admin) internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(PAUSER_ROLE, _admin);
    }

    /**
     * @dev See {IOwnablePausableUpgradeable-isPauser}.
     */
    function isPauser(address _account) public override view returns (bool) {
        return hasRole(PAUSER_ROLE, _account);
    }

    /**
     * @dev See {IOwnablePausableUpgradeable-addPauser}.
     */
    function addPauser(address _account) external override {
        grantRole(PAUSER_ROLE, _account);
    }

    /**
     * @dev See {IOwnablePausableUpgradeable-removePauser}.
     */
    function removePauser(address _account) external override {
        revokeRole(PAUSER_ROLE, _account);
    }

    /**
     * @dev See {IOwnablePausableUpgradeable-pause}.
     */
    function pause() external override onlyPauser {
        _pause();
    }

    /**
     * @dev See {IOwnablePausableUpgradeable-unpause}.
     */
    function unpause() external override onlyPauser {
        _unpause();
    }
}
