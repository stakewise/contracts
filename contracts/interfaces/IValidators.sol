// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the Validators contract.
 */
interface IValidators {
    /**
    * @dev Event for tracking registered validators.
    * @param entityId - ID of the entity where the deposit was accumulated.
    * @param pubKey - validator public key.
    * @param withdrawalCredentials - withdrawal credentials used to perform withdrawal for the validator in the beacon chain.
    * @param maintainerFee - fee to pay to the maintainer after the withdrawal.
    * @param stakingDuration - staking duration of the validator.
    * @param depositAmount - validator deposit amount.
    */
    event ValidatorRegistered(
        bytes32 indexed entityId,
        bytes pubKey,
        bytes withdrawalCredentials,
        uint256 maintainerFee,
        uint256 stakingDuration,
        uint256 depositAmount
    );

    /**
    * @dev Event for tracking wallet assignment.
    * @param validatorId - ID (public key hash) of the validator wallet is assigned to.
    * @param wallet - address of the wallet the deposits and rewards will be withdrawn to.
    */
    event WalletAssigned(bytes32 validatorId, address indexed wallet);

    /**
    * @dev Function for getting validator information.
    * @param _validatorId - ID of the validator (hash of the public key).
    */
    function validators(bytes32 _validatorId) external view returns (uint256, uint256, bytes32, address);

    /**
    * @dev Constructor for initializing the Validators contract.
    * @param _periodicPools - address of the periodic Pools contract.
    * @param _phase2Pools - address of the phase 2 Pools contract.
    * @param _solos - address of the Solos contract.
    * @param _groups - address of the Groups contract.
    * @param _settings - address of the Settings contract.
    * @param _walletImplementation - address of the wallet logical contract.
    * @param _walletInitData - wallet initialization data for proxy creation.
    */
    function initialize(
        address _periodicPools,
        address _phase2Pools,
        address _solos,
        address _groups,
        address _managers,
        address _settings,
        address _walletImplementation,
        bytes memory _walletInitData
    ) external;

    /**
    * @dev Function for registering validators. Can only be called by collectors.
    * @param _pubKey - BLS public key of the validator.
    * @param _withdrawalCredentials - withdrawal credentials used for the validator withdrawal.
    * @param _entityId - ID of the entity where the validator deposit was accumulated.
    * @param _depositAmount - validator deposit amount.
    * @param _maintainerFee - fee to be payed to the maintainer after staking finished.
    */
    function register(
        bytes calldata _pubKey,
        bytes calldata _withdrawalCredentials,
        bytes32 _entityId,
        uint256 _depositAmount,
        uint256 _maintainerFee
    ) external;

    /**
    * @dev Function for updating existing validators. Can only be called by collectors.
    * @param _validatorId - ID of the validator to update.
    * @param _newEntityId - ID of the new entity, the validator should be assigned to.
    * @param _newMaintainerFee - fee to be payed to the maintainer after staking finished.
    */
    function update(bytes32 _validatorId, bytes32 _newEntityId, uint256 _newMaintainerFee) external;

    /**
    * @dev Function for assigning wallet to a validator.
    * Can only be called by users with a manager role.
    * @param _validatorId - ID (public key hash) of the validator wallet should be assigned to.
    */
    function assignWallet(bytes32 _validatorId) external;
}
