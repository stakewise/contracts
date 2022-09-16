// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.7.5;

/**
 * @dev Interface of the FeesEscrow contract.
 */
interface IFeesEscrow {
    /**
    * @dev Event for tracking fees withdrawals to Pool contract.
    * @param amount - the number of fees.
    */
    event FeesTransferred(uint256 amount);

    /**
    * @dev Function is used to transfer accumulated rewards to Pool contract.
    * Can only be executed by the RewardToken contract. Also, rewards are accumulated
    * in xDAI native tokens, converted to mGNO and transferred to Pool.
    */
    function transferToPool() external returns (uint256);
}
