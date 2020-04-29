pragma solidity 0.5.17;

import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "./Withdrawals.sol";

/**
 * @title Wallet
 * Each validator will have its own wallet contract which will store validator balance after the withdrawal.
 * The withdrawals can only be performed from the Withdrawals contract.
 */
contract Wallet {
    using Address for address payable;

    // address of the Withdrawals contract.
    Withdrawals private withdrawals;

    /**
    * Event for tracking transfers made to this contract.
    * @param sender - address of the transfer sender.
    * @param amount - amount transferred.
    */
    event EtherAdded(address indexed sender, uint256 amount);

    /**
    * Constructor for initializing the Wallet contract.
    * @param _withdrawals - address of the Withdrawals contract.
    */
    constructor(Withdrawals _withdrawals) public {
        withdrawals = _withdrawals;
    }

    /**
    * a fallback function to receive transfers.
    */
    function() external payable {
        emit EtherAdded(msg.sender, msg.value);
    }

    /**
    * Function for sending ether to the recipient.
    * Can only be called from the Withdrawals contract.
    * @param _recipient - address of the recipient.
    * @param _amount - amount to transfer to the recipient.
    */
    function withdraw(address payable _recipient, uint256 _amount) external {
        require(msg.sender == address(withdrawals), "Permission denied.");

        // transfer withdrawal amount to the recipient
        _recipient.sendValue(_amount);
    }
}
