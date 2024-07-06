// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import {IRewardToken} from "../interfaces/IRewardToken.sol";


contract VaultMock {
    event Migrated(address receiver, uint256 assets, uint256 shares);

    IRewardToken private rewardToken;
    uint256 public migratedAssets;

    constructor(address _rewardToken) {
        rewardToken = IRewardToken(_rewardToken);
    }

    function updateTotalRewards(int256 rewardsDelta) external {
        rewardToken.updateTotalRewards(rewardsDelta);
    }

    function migrate(address receiver, uint256 assets) external returns (uint256 shares) {
        shares = assets;
        migratedAssets = assets;
        emit Migrated(receiver, assets, shares);
    }
}
