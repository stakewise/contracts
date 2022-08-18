// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the FeesEscrow contract.
 */
interface IFeesEscrow {
    /**
    * @dev Event for tracking fees withdrawals to Pool contract.
    * @param amountDAI - an amount of rewards before swap to GNO via Balancer Vault.
    * @param amountGNO - an amount of rewards after swap.
    */
    event FeesTransferred(uint256 amountDAI, uint256 amountGNO);

    /**
    * @dev Function is used to transfer accumulated rewards to Pool contract.
    * Can only be executed by the RewardEthToken contract. Also rewards accumulating
    * in xDAI native tokens and this method swaps them to GNO token. Next GNO tokens
    * are transferred to Pool.
    */
    function transferToPool() external returns (uint256);
}
