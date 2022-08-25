// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "../interfaces/IPool.sol";
import "../interfaces/IFeesEscrow.sol";

/**
 * @title FeesEscrow
 *
 * @dev FeesEscrow contract is used to receive tips from validators and transfer
 * them to the Pool contract via calling transferToPool method by RewardEthToken contract.
 */
contract FeesEscrow is IFeesEscrow {
    // @dev Pool contract's address.
    IPool private immutable pool;

    // @dev RewardEthToken contract's address.
    address private immutable rewardEthToken;

    constructor(IPool _pool, address _rewardEthToken) {
        pool = _pool;
        rewardEthToken = _rewardEthToken;
    }

    /**
     * @dev See {IFeesEscrow-transferToPool}.
     */
    function transferToPool() external override returns (uint256) {
        require(msg.sender == rewardEthToken, "FeesEscrow: invalid caller");

        uint256 balance = address(this).balance;

        if (balance == 0) {
            return balance;
        }

        pool.receiveFees{value: balance}();

        emit FeesTransferred(balance);

        return balance;
    }

    /**
     * @dev Allows FeesEscrow contract to receive MEV rewards and priority fees. Later these rewards will be transferred
     * to the `Pool` contract by `FeesEscrow.transferToPool` method which is called by the `RewardEthToken` contract.
     */
    receive() external payable {}
}
