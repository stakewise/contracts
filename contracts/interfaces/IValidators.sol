// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the Validators contract.
 */
interface IValidators {
    /**
    * @dev Function for checking whether public key was already used.
    * @param publicKey - hash of public key to check.
    */
    function publicKeys(bytes32 publicKey) external view returns (bool);

    /**
    * @dev Event for tracking registered validators.
    * @param entityId - ID of the entity where the deposit was accumulated.
    * @param pubKey - validator public key.
    */
    event ValidatorRegistered(bytes32 indexed entityId, bytes pubKey);

    /**
    * @dev Constructor for initializing the Validators contract.
    * @param _pool - address of the Pool contract.
    * @param _solos - address of the Solos contract.
    */
    function initialize(address _pool, address _solos) external;

    /**
    * @dev Function for registering validators. Can only be called by collectors.
    * @param _pubKey - BLS public key of the validator.
    * @param _entityId - ID of the entity where the validator deposit was accumulated.
    */
    function register(bytes calldata _pubKey, bytes32 _entityId) external;
}
