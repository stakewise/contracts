// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the ValidatorTransfers contract.
 */
interface IValidatorTransfers {
    /**
    * @dev Event for tracking validator transfers.
    * @param validatorId - ID of the transferred validator.
    * @param prevEntityId - ID of the previous entity, the validator was transferred from.
    * @param newEntityId - ID of the new entity, the validator was transferred to.
    * @param userDebt - validator debt to the users of previous entity.
    * @param maintainerDebt - validator debt to the maintainer of the previous entity.
    * @param newMaintainerFee - new fee to pay to the maintainer after new entity transfer or withdrawal.
    * @param newStakingDuration - new staking duration of the validator.
    */
    event ValidatorTransferred(
        bytes32 validatorId,
        bytes32 prevEntityId,
        bytes32 indexed newEntityId,
        uint256 userDebt,
        uint256 maintainerDebt,
        uint256 newMaintainerFee,
        uint256 newStakingDuration
    );

    /**
    * @dev Event for tracking user withdrawals.
    * @param sender - address of the deposit sender.
    * @param recipient - address where withdrawn funds will be sent.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param depositAmount - withdrawn deposit amount.
    * @param rewardAmount - withdrawn reward amount.
    */
    event UserWithdrawn(
        address sender,
        address recipient,
        bytes32 entityId,
        uint256 depositAmount,
        uint256 rewardAmount
    );

    /**
    * @dev Event for tracking resolved validator debt.
    * @param validatorId - ID of the validator, the debt was resolved for.
    */
    event DebtResolved(bytes32 validatorId);

    /**
    * @dev Function for getting validator debt.
    * @param _validatorId - ID of the validator (hash of the public key).
    */
    function validatorDebts(bytes32 _validatorId) external view returns (uint256, uint256, bool);

    /**
    * @dev Function for getting entity reward.
    * @param _entityId - ID of the entity.
    */
    function entityRewards(bytes32 _entityId) external view returns (bytes32, uint256);

    /**
    * @dev Function for getting user withdrawal.
    * @param _userId - ID of the user.
    */
    function userWithdrawals(bytes32 _userId) external view returns (bool, bool);

    /**
    * @dev Constructor for initializing the ValidatorTransfers contract.
    * @param _periodicPools - address of the periodic Pools contract.
    * @param _phase2Pools - address of the phase 2 Pools contract.
    * @param _solos - address of the Solos contract.
    * @param _groups - address of the Groups contract.
    * @param _withdrawals - address of the Withdrawals contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _validators - address of the Validators contract.
    */
    function initialize(
        address _periodicPools,
        address _phase2Pools,
        address _solos,
        address _groups,
        address _withdrawals,
        address _deposits,
        address _settings,
        address _validators
    ) external;

    /**
    * @dev Function for registering validator transfers.
    * @param _validatorId - ID of the transferred validator.
    * @param _prevEntityId - ID of the entity, the validator was transferred from.
    * @param _userDebt - validator reward debt to the entity users.
    * @param _maintainerDebt - validator reward debt to the maintainer.
    */
    function registerTransfer(
        bytes32 _validatorId,
        bytes32 _prevEntityId,
        uint256 _userDebt,
        uint256 _maintainerDebt
    ) external payable;

    /**
    * @dev Function for resolving validator debt. Can only be called by Withdrawals contract.
    * @param _validatorId - ID of the validator to resolve debt for.
    */
    function resolveDebt(bytes32 _validatorId) external;

    /**
    * Function for allowing transfer for the validator. Can only be called by collector contracts.
    * @param _entityId - ID of the entity, which owns the validator.
    */
    function allowTransfer(bytes32 _entityId) external;

    /**
    * Function for checking whether validator transfer can be performed.
    * @param _entityId - ID of the entity, which owns the validator.
    */
    function checkTransferAllowed(bytes32 _entityId) external view returns (bool);

    /**
    * @dev Function for withdrawing deposits and rewards to the recipient address.
    * User reward is calculated based on the deposit amount.
    * @param _entityId - ID of the entity, the deposit belongs to.
    * @param _recipient - address where withdrawn funds will be sent.
    * Must be the same as specified during the deposit creation.
    */
    function withdraw(bytes32 _entityId, address payable _recipient) external;
}
