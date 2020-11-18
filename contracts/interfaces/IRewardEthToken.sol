// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the RewardEthToken contract.
 */
interface IRewardEthToken is IERC20 {
    /**
    * @dev Structure for storing information about user reward checkpoint.
    * @param rewardPerToken - user reward per token.
    * @param reward - user reward checkpoint.
    */
    struct Checkpoint {
        int256 rewardPerToken;
        int256 reward;
    }

    /**
    * @dev Event for tracking rewards update by balance reporters.
    * @param periodRewards - rewards since the last update.
    * @param totalRewards - total amount of rewards.
    * @param rewardPerToken - calculated reward per token for account reward calculation.
    * @param updateTimestamp - last rewards update timestamp by balance reporters.
    */
    event RewardsUpdated(
        int256 periodRewards,
        int256 totalRewards,
        int256 rewardPerToken,
        uint256 updateTimestamp
    );

    /**
    * @dev Constructor for initializing the RewardEthToken contract.
    * @param _stakedEthToken - address of the StakedEthToken contract.
    * @param _settings - address of the Settings contract.
    * @param _balanceReporters - address of the BalanceReporters contract.
    * @param _stakedTokens - address of the StakedTokens contract.
    */
    function initialize(address _stakedEthToken, address _settings, address _balanceReporters, address _stakedTokens) external;

    /**
    * @dev Function for retrieving the last total rewards update timestamp.
    */
    function updateTimestamp() external view returns (uint256);

    /**
    * @dev Function for retrieving the total rewards amount. Can be negative in case of penalties.
    */
    function totalRewards() external view returns (int256);

    /**
    * @dev Function for retrieving current reward of the account.
    * Can be negative in case account's deposit is penalised.
    * @param account - address of the account to retrieve the reward for.
    */
    function rewardOf(address account) external view returns (int256);

    /**
    * @dev Function for updating account's reward checkpoint.
    * Can only be called by StakedEthToken contract.
    * @param account - address of the account to update the reward checkpoint for.
    */
    function updateRewardCheckpoint(address account) external;

    /**
    * @dev Function for updating validators total rewards.
    * Can only be called by Balance Reporters contract.
    * @param newTotalRewards - new total rewards.
    */
    function updateTotalRewards(int256 newTotalRewards) external;

    /**
    * @dev Function for claiming rewards. Can only be called by StakedTokens contract.
    * @param sender - address of the rewards sender.
    * @param recipient - address of the rewards recipient.
    * @param amount - amount of rewards to send.
    */
    function claim(address sender, address recipient, uint256 amount) external;
}
