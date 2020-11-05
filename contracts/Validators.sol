// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "./interfaces/IValidators.sol";
import "./interfaces/ISettings.sol";


/**
 * @title Validators
 *
 * @dev Validators contract keeps track of all the registered validators.
 * Only collectors can register validators.
 */
contract Validators is IValidators, Initializable {
    // @dev Maps hash of the public key to whether it was already used.
    mapping(bytes32 => bool) public override publicKeys;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Checks whether the caller is the collector contract.
    modifier onlyCollectors() {
        require(msg.sender == solos || msg.sender == pool, "Validators: permission denied");
        _;
    }

    /**
     * @dev See {IValidators-initialize}.
     */
    function initialize(address _pool, address _solos, address _settings) public override initializer {
        pool = _pool;
        solos = _solos;
        settings = ISettings(_settings);
    }

    /**
     * @dev See {IValidators-register}.
     */
    function register(bytes calldata _pubKey, bytes32 _entityId) external override onlyCollectors {
        require(!settings.pausedContracts(address(this)), "Validators: contract is paused");
        bytes32 validatorId = keccak256(abi.encodePacked(_pubKey));
        require(!publicKeys[validatorId], "Validators: public key has been already used");

        publicKeys[validatorId] = true;
        emit ValidatorRegistered(_entityId, _pubKey, settings.validatorPrice());
    }
}
