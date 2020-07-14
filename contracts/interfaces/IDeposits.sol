// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

/**
 * @dev Interface of the Deposits contract.
 */
interface IDeposits {
    /**
    * @dev Event for tracking added deposits.
    * @param collector - address of the collector, the deposit was received from.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param sender - address of the deposit sender.
    * @param recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    * @param amount - amount deposited.
    */
    event DepositAdded(
        address collector,
        bytes32 entityId,
        address sender,
        address recipient,
        uint256 amount
    );

    /**
    * @dev Event for tracking canceled deposits.
    * @param collector - address of the collector, the deposit was canceled from.
    * @param entityId - ID of the collector entity, the deposit was collected in.
    * @param sender - address of the deposit sender.
    * @param recipient - address where canceled deposit will be sent.
    * @param amount - amount canceled.
    */
    event DepositCanceled(
        address collector,
        bytes32 entityId,
        address sender,
        address recipient,
        uint256 amount
    );

    /**
    * @dev Function for getting deposit amount.
    * @param _depositId - ID of the deposit (hash of entity ID, sender, recipient).
    */
    function amounts(bytes32 _depositId) external view returns (uint256);

    /**
    * @dev Constructor for initializing the Deposits contract.
    * @param _periodicPools - address of the periodic Pools contract.
    * @param _phase2Pools - address of the phase 2 Pools contract.
    * @param _solos - address of the Solos contract.
    * @param _groups - address of the Groups contract.
    */
    function initialize(address _periodicPools, address _phase2Pools, address _solos, address _groups) external;

    /**
    * @dev Function for retrieving user deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    */
    function getDeposit(bytes32 _entityId, address _sender, address _recipient) external view returns (uint256);

    /**
    * @dev Function for adding deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where funds will be sent after the withdrawal or if the deposit will be canceled.
    * @param _amount - amount deposited.
    */
    function addDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external;

    /**
    * @dev Function for canceling deposit.
    * @param _entityId - ID of the collector entity, the deposit was collected in.
    * @param _sender - address of the deposit sender.
    * @param _recipient - address where canceled deposit amount will be sent.
    * @param _amount - amount canceled.
    */
    function cancelDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external;
}
