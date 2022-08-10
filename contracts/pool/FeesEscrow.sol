// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IFeesEscrow.sol";

contract FeesEscrow is IFeesEscrow {
    address public pool;
    address public rewardEthToken;

    constructor(address _pool, address _rewardEthToken) {
        pool = _pool;
        rewardEthToken = _rewardEthToken;
    }

    function transferToPool() public override returns (uint256) {
        uint256 balance = address(this).balance;

        require(msg.sender == rewardEthToken, "FeesEscrow: invalid caller");
        if (balance == 0) {
            return balance;
        }

        IPool(pool).receiveFees{value: balance}();

        emit FeesTransferred(balance);

        return balance;
    }

    receive() external payable {}
}
