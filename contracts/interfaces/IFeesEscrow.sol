// SPDX-License-Identifier: AGPL-3.0-only

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
    * Can only be executed by the RewardEthToken contract.
    */
    function transferToPool() external returns (uint256);
}
