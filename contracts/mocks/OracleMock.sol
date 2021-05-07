// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IOracles.sol";

contract OracleMock {
    IOracles private oracles;
    IERC20Upgradeable private stakedEthToken;
    IERC20Upgradeable private rewardEthToken;

    constructor(address _oracles, address _stakedEthToken, address _rewardEthToken) {
        oracles = IOracles(_oracles);
        stakedEthToken = IERC20Upgradeable(_stakedEthToken);
        rewardEthToken = IERC20Upgradeable(_rewardEthToken);
    }

    function updateTotalRewardsWithMerkleRoot(
        uint256 totalRewards,
        uint256 activatedValidators,
        bytes32 merkleRoot,
        string calldata merkleProofs
    )
        external
    {
        oracles.voteForRewards(totalRewards, activatedValidators);
        oracles.voteForMerkleRoot(merkleRoot, merkleProofs);
    }

    function updateTotalRewardsAndTransferRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        oracles.voteForRewards(totalRewards, activatedValidators);
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
    }

    function transferRewardsAndUpdateTotalRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
        oracles.voteForRewards(totalRewards, activatedValidators);
    }

    function updateTotalRewardsAndTransferStakedEth(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        oracles.voteForRewards(totalRewards, activatedValidators);
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
    }

    function transferStakedEthAndUpdateTotalRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
        oracles.voteForRewards(totalRewards, activatedValidators);
    }
}
