// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the Managers contract.
 */
interface IManagers {
    /**
    * @dev Event for tracking added managers.
    * @param account - address of the account which was assigned a manager role.
    */
    event ManagerAdded(address account);

    /**
    * @dev Event for tracking removed managers.
    * @param account - address which was removed manager role.
    */
    event ManagerRemoved(address account);

    /**
    * @dev Constructor for initializing the Managers contract.
    * @param _solos - address of the Solos contract.
    * @param _groups - address of the Groups contract.
    * @param _admins - address of the Admins contract.
    */
    function initialize(address _solos, address _groups, address _admins) external;

    /**
    * @dev Function for checking whether an account has a manager role.
    * @param _account - account to check.
    */
    function isManager(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether validator ownership can be transferred.
    * @param _entityId - ID of the entity to transfer validator from.
    * @param _signature - signature of the entity transfer manager.
    */
    function canTransferValidator(bytes32 _entityId, bytes calldata _signature) external view returns (bool);

    /**
    * @dev Function for assigning a transfer manager to the entity.
    * Can only be called by the collector contracts.
    * @param _entityId - ID of the entity to assign transfer manager for.
    * @param _account - account to assign a transfer manager role to.
    */
    function addTransferManager(bytes32 _entityId, address _account) external;

    /**
    * @dev Function for adding a manager role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign a manager role to.
    */
    function addManager(address _account) external;

    /**
    * @dev Function for removing a manager role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove a manager role from.
    */
    function removeManager(address _account) external;
}
