pragma solidity 0.5.16;

import "./Withdrawals.sol";

/**
 * @title Wallet
 * Wallet contract is used by Ethereum network to send deposits and rewards to.
 * The withdrawals can only be performed from the Withdrawals contract.
 */
contract Wallet {
    // Address of the Withdrawals contract.
    Withdrawals private withdrawals;

    /**
    * Event for tracking transfers made to this contract.
    * @param sender - an address of the transfer sender.
    * @param amount - an amount transferred.
    */
    event EtherAdded(address indexed sender, uint256 amount);

    /**
    * Constructor for initializing the Wallet contract.
    * @param _withdrawals - Address of the Withdrawals contract.
    */
    constructor(Withdrawals _withdrawals) public {
        withdrawals = _withdrawals;
    }

    /**
    * A fallback function to receive transfers.
    */
    function() external payable {
        emit EtherAdded(msg.sender, msg.value);
    }

    /**
    * Function for sending ether to the withdrawer.
    * Can only be called by the Withdrawals contract.
    * @param _withdrawer - An address of the withdrawer.
    * @param _amount - An amount to transfer to the withdrawer.
    */
    function withdraw(address payable _withdrawer, uint256 _amount) external {
        require(msg.sender == address(withdrawals), "Permission denied.");
        // https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/
        // solhint-disable avoid-call-value
        // solium-disable-next-line security/no-call-value
        (bool success, ) = _withdrawer.call.value(_amount)("");
        require(success, "Transfer has failed.");
    }
}
