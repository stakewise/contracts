// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "./IOperators.sol";
import "./IManagers.sol";
import "./ISettings.sol";

/**
 * @dev Interface of the Payments contract.
 */
interface IPayments {
    /**
    * @dev Constructor for initializing the Payments contract.
    * @param _operators - address of the Operators contract.
    * @param _managers - address of the Managers contract.
    * @param _settings - address of the Settings contract.
    * @param _dai - address of the DAI contract.
    * @param _owner - address of the contract owner.
    */
    function initialize(
        IOperators _operators,
        IManagers _managers,
        ISettings _settings,
        address _dai,
        address _owner
    ) external;

    /**
    * @dev Function for setting tokens refund recipient.
    * @param _refundRecipient - new address of the refund recipient.
    */
    function setRefundRecipient(address _refundRecipient) external;

    /**
    * @dev Function to start metering new validator.
    * @param _validatorId - ID of the validator (hash of the public key) to start metering.
    */
    function startMeteringValidator(bytes32 _validatorId) external;

    /**
    * @dev Function to stop metering the validator.
    * @param _validatorId - ID of the validator (hash of the public key) to stop metering.
    */
    function stopMeteringValidator(bytes32 _validatorId) external;

    /**
    * @dev Function for retrieving total bill until specific timestamp.
    * @param _timestamp - timestamp in seconds until to retrieve total bill.
    */
    function getTotalBill(uint256 _timestamp) external view returns (uint256);

    /**
    * @dev Function for retrieving total validators price.
    */
    function getTotalPrice() external view returns (uint256);

    /**
    * @dev Function to withdraw tokens to the maintainer.
    * @param _amount - the amount of tokens to withdraw.
    */
    function withdraw(uint256 _amount) external;

    /**
    * @dev Function to refund tokens back to the user.
    * @param _amount - the amount of tokens to refund.
    */
    function refund(uint256 _amount) external;
}
