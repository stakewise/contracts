// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;


/**
 * @title IGnoGenesisVault
 * @author StakeWise
 * @notice Defines the interface for the GnoGenesisVault contract
 */
interface IGnoGenesisVault {
  /**
   * @notice Function for migrating from StakeWise v2. Can be called only by RewardToken contract.
   * @param receiver The address of the receiver
   * @param assets The amount of assets migrated
   * @return shares The amount of shares minted
   */
  function migrate(address receiver, uint256 assets) external returns (uint256 shares);
}
