// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the Roles contract.
 */
interface IRoles {
    /**
    * @dev Event for tracking operators' updates.
    * @param operator - address of the operator.
    * @param revenueShare - the share of the protocol's revenue to distribute.
    */
    event OperatorUpdated(address indexed operator, uint256 revenueShare);

    /**
    * @dev Event for tracking operators' removals.
    * @param operator - address of the operator.
    */
    event OperatorRemoved(address indexed operator);

    /**
    * @dev Event for tracking partners' updates.
    * @param partner - address of the partner.
    * @param revenueShare - the share of the protocol's revenue to distribute.
    */
    event PartnerUpdated(address indexed partner, uint256 revenueShare);

    /**
    * @dev Event for tracking partners' removals.
    * @param partner - address of the partner.
    */
    event PartnerRemoved(address indexed partner);

    /**
    * @dev Constructor for initializing the Roles contract.
    * @param admin - address of the contract admin.
    */
    function initialize(address admin) external;

    /**
    * @dev Function for updating the operator. Can only be called by account with `admin` privilege.
    * @param account - address of the account to update.
    * @param revenueShare - the share of the protocol's revenue to distribute to the operator based on its total validators.
    */
    function setOperator(address account, uint256 revenueShare) external;

    /**
    * @dev Function for removing the operator. Can only be called by account with `admin` privilege.
    * @param account - address of the account to remove.
    */
    function removeOperator(address account) external;

    /**
    * @dev Function for setting the partner. Can only be called by account with `admin` privilege.
    * @param account - address of the account to update.
    * @param revenueShare - the share of the protocol's revenue to distribute to the partner based on its contributed ETH amount.
    */
    function setPartner(address account, uint256 revenueShare) external;

    /**
    * @dev Function for removing the partner. Can only be called by account with `admin` privilege.
    * @param account - address of the account to remove.
    */
    function removePartner(address account) external;
}
