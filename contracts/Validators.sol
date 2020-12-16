// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IValidators.sol";


/**
 * @title Validators
 *
 * @dev Validators contract keeps track of all the registered validators.
 * Only collectors can register validators.
 */
contract Validators is IValidators, OwnablePausableUpgradeable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // @dev Maps hash of the public key to whether it was already used.
    mapping(bytes32 => bool) public override publicKeys;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Checks whether the caller is the collector contract.
    modifier onlyCollector() {
        require(msg.sender == solos || msg.sender == pool, "Validators: permission denied");
        _;
    }

    /**
     * @dev See {IValidators-initialize}.
     */
    function initialize(address _admin, address _pool, address _solos) public override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        pool = _pool;
        solos = _solos;
    }

    /**
     * @dev See {IValidators-isOperator}.
     */
    function isOperator(address _account) public override view returns (bool) {
        return hasRole(OPERATOR_ROLE, _account);
    }

    /**
     * @dev See {IValidators-addOperator}.
     */
    function addOperator(address _account) external override {
        grantRole(OPERATOR_ROLE, _account);
    }

    /**
     * @dev See {IValidators-removeOperator}.
     */
    function removeOperator(address _account) external override {
        revokeRole(OPERATOR_ROLE, _account);
    }

    /**
     * @dev See {IValidators-register}.
     */
    function register(bytes32 _validatorId) external override onlyCollector whenNotPaused {
        require(!publicKeys[_validatorId], "Validators: public key has been already used");
        publicKeys[_validatorId] = true;
    }
}
