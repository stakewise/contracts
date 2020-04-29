pragma solidity 0.5.17;

import "./Withdrawals.sol";

/**
 * @title Wallet
 * Each validator will have its own wallet contract which will store validator balance after the withdrawal.
 * The withdrawals can only be performed from the Withdrawals contract.
 */
contract Wallet {
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
        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success,) = _recipient.call.value(_amount)("");
        // solhint-enable avoid-call-value
        require(success, "Transfer has failed.");
    }
}
