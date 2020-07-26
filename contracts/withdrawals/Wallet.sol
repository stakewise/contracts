// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IWallet.sol";

/**
 * @title Wallet
 *
 * @dev Each validator will have its own wallet contract which will store validator balance after the withdrawal.
 * The withdrawals can only be performed from the Withdrawals contract.
 */
contract Wallet is IWallet, Initializable {
    using Address for address payable;

    // @dev Address of the Withdrawals contract.
    address private withdrawals;

    /**
    * @dev Constructor for initializing the Wallet contract.
    * @param _withdrawals - address of the Withdrawals contract.
    */
    function initialize(address _withdrawals) public override initializer {
        withdrawals = _withdrawals;
    }

    /**
    * @dev Function for sending ether to the recipient.
    * Can only be called from the Withdrawals contract.
    * @param _recipient - address of the recipient.
    * @param _amount - amount to transfer to the recipient.
    */
    function withdraw(address payable _recipient, uint256 _amount) external override {
        require(msg.sender == withdrawals, "Permission denied.");

        // transfer withdrawal amount to the recipient
        _recipient.sendValue(_amount);
    }

    /**
    * @dev Fallback function to receive transfers.
    */
    receive() external payable {}
}
