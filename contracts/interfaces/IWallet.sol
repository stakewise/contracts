// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the IWallet contract.
 */
interface IWallet {
    /**
    * @dev Constructor for initializing the Wallet contract.
    * @param _withdrawals - address of the Withdrawals contract.
    */
    function initialize(address _withdrawals) external;

    /**
    * @dev Function for sending ether to the recipient.
    * Can only be called from the Withdrawals contract.
    * @param _recipient - address of the recipient.
    * @param _amount - amount to transfer to the recipient.
    */
    function withdraw(address payable _recipient, uint256 _amount) external;
}
