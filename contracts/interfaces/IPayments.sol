// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/**
 * @dev ABIEncoderV2 is used to enable encoding/decoding of the array of structs. The pragma
 * is required, but ABIEncoderV2 is no longer considered experimental as of Solidity 0.6.0
 */

/**
 * @dev Interface of the Payments contract.
 */
interface IPayments {
    /**
    * @dev Structure for passing information about executed payment.
    * @param billDate - timestamp of the bill date.
    * @param sender - address of the payment sender.
    * @param amount - selected token payment amount.
    */
    struct Payment {
        uint256 billDate;
        address sender;
        uint256 amount;
    }

    /**
    * @dev Event for tracking balance updates.
    * @param token - address of the updated token.
    * @param account - address of the updated account.
    */
    event BalanceUpdated(address indexed token, address indexed account);

    /**
    * @dev Event for tracking executed payments.
    * @param billDate - timestamp of the paid bill.
    * @param token - address of the token used for payment.
    * @param sender - address of the payment sender.
    * @param recipient - address of the payment recipient.
    * @param amount - amount transferred.
    */
    event PaymentSent(
        uint256 indexed billDate,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount
    );

    /**
    * @dev Function for getting account's selected token contract address.
    * @param _account - address of account to retrieve the selected token for.
    */
    function selectedTokens(address _account) external view returns (address);

    /**
    * @dev Constructor for initializing the Payments contract.
    * @param _settings - address of the Settings contract.
    * @param _managers - address of the Managers contract.
    */
    function initialize(address _settings, address _managers) external;

    /**
    * @dev Function for retrieving account's balance.
    * @param _account - address of account to retrieve balance for.
    */
    function balanceOf(address _account) external view returns (uint256);

    /**
    * @dev Function for adding tokens to the account's balance.
    * @param _token - address of the token to use.
    * @param _amount - amount of tokens to add.
    */
    function addTokens(address _token, uint256 _amount) external;

    /**
    * @dev Function for withdrawing tokens from the account's balance.
    * @param _amount - amount of tokens to withdraw.
    */
    function withdrawTokens(uint256 _amount) external;

    /**
    * @dev Function for executing token payments.
    * @param _payments - list of payments to execute.
    */
    function executePayments(Payment[] calldata _payments) external;
}
