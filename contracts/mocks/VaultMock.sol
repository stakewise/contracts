// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import {IRewardEthToken} from "../interfaces/IRewardEthToken.sol";


contract VaultMock {
    event Migrated(address receiver, uint256 assets, uint256 shares);

    IRewardEthToken private rewardEthToken;
    uint256 public migratedAssets;

    constructor(address _rewardEthToken) {
        rewardEthToken = IRewardEthToken(_rewardEthToken);
    }

    function updateTotalRewards(int256 rewardsDelta) external {
        rewardEthToken.updateTotalRewards(rewardsDelta);
    }

    function migrate(address receiver, uint256 assets) external returns (uint256 shares) {
        shares = assets;
        migratedAssets = assets;
        emit Migrated(receiver, assets, shares);
    }
}
