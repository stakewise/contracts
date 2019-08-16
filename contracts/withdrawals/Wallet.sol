pragma solidity 0.5.10;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./Withdrawals.sol";

contract Wallet is Initializable {

    Withdrawals private withdrawals;

    event EtherAdded(
        address indexed sender,
        uint256 amount
    );

    event EtherSent(
        address indexed receiver,
        uint256 amount
    );

    function initialize(Withdrawals _withdrawals) public initializer {
        withdrawals = _withdrawals;
    }

    function() external payable {
        emit EtherAdded(msg.sender, msg.value);
    }

    function withdraw(address payable _withdrawer, uint256 _amount) external {
        require(msg.sender == address(withdrawals), "Permission denied.");
        emit EtherSent(_withdrawer, _amount);
        _withdrawer.transfer(_amount);
    }
}
