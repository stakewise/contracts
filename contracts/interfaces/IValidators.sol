// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the Validators contract.
 */
interface IValidators {
    /**
    * @dev Constructor for initializing the Validators contract.
    * @param _admin - address of the contract admin.
    * @param _pool - address of the Pool contract.
    * @param _solos - address of the Solos contract.
    */
    function initialize(address _admin, address _pool, address _solos) external;

    /**
    * @dev Function for checking whether an account has an operator role.
    * @param _account - account to check.
    */
    function isOperator(address _account) external view returns (bool);

    /**
    * @dev Function for adding an operator role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign an operator role to.
    */
    function addOperator(address _account) external;

    /**
    * @dev Function for removing an operator role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove an operator role from.
    */
    function removeOperator(address _account) external;

    /**
    * @dev Function for checking whether public key was already used.
    * @param _publicKey - hash of public key to check.
    */
    function publicKeys(bytes32 _publicKey) external view returns (bool);

    /**
    * @dev Function for registering validators. Can only be called by collectors.
    * @param _validatorId - ID of the validator.
    */
    function register(bytes32 _validatorId) external;
}
