// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "../interfaces/IPool.sol";
import "../interfaces/IFeesEscrow.sol";

contract FeesEscrow is IFeesEscrow {
    address public pool;
    address public rewardEthToken;

    constructor(address _pool, address _rewardEthToken) {
        pool = _pool;
        rewardEthToken = _rewardEthToken;
    }

    function transferToPool() external override returns (uint256) {
        require(msg.sender == rewardEthToken, "FeesEscrow: invalid caller");

        uint256 balance = address(this).balance;

        if (balance == 0) {
            return balance;
        }

        IPool(pool).receiveFees{value: balance}();

        emit FeesTransferred(balance);

        return balance;
    }

    receive() external payable {}
}
