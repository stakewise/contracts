// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the StakedTokens contract.
 */
interface IStakedTokens {
    /**
    * @dev Structure for storing information about reward checkpoint for accounts and tokens.
    * @param rewardPerToken - last synced reward per token.
    * @param totalRewards - last synced total rewards.
    */
    struct Checkpoint {
        int256 rewardPerToken;
        int256 totalRewards;
    }

    /**
    * @dev Event for tracking account staked tokens.
    * @param token - address of the tokens contract.
    * @param account - address of the account.
    * @param amount - amount of tokens staked.
    */
    event TokensStaked(address indexed token, address indexed account, uint256 amount);

    /**
    * @dev Event for tracking whether token contract is enabled or not.
    * @param token - address of the token.
    * @param isEnabled - whether the token is enabled or not.
    */
    event TokenToggled(address indexed token, bool isEnabled);

    /**
    * @dev Event for tracking account withdrawn reward.
    * @param token - address of the token.
    * @param account - address of the account the reward was withdrawn from.
    * @param amount - amount of reward withdrawn.
    */
    event RewardWithdrawn(address indexed token, address account, uint256 amount);

    /**
    * @dev Event for tracking account withdrawn tokens.
    * @param token - address of the tokens contract.
    * @param account - address of the account.
    * @param amount - amount of tokens withdrawn.
    */
    event TokensWithdrawn(address indexed token, address indexed account, uint256 amount);

    /**
    * @dev Function for checking whether token is supported or not.
    * @param _token - address of the token to check.
    */
    function supportedTokens(address _token) external view returns (bool);

    /**
    * @dev Constructor for initializing the StakedTokens contract.
    * @param _settings - address of the Settings contract.
    * @param _admins - address of the Admins contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    */
    function initialize(address _settings, address _admins, address _rewardEthToken) external;

   /**
   * @dev Function for enabling or disabling token contract. Can only be called by an admin user.
   * @param _token - address of the token to toggle.
   */
    function toggleTokenContract(address _token, bool _isSupported) external;

    /**
    * @dev Function for staking tokens which inherit rewards.
    * @param _token - address of the token to stake tokens for.
    * @param _amount - amount of tokens to stake.
    * @param _withdrawnReward - the amount of already accumulated rewards to withdraw.
    */
    function stakeTokens(address _token, uint256 _amount, uint256 _withdrawnReward) external;

    /**
    * @dev Function for withdrawing staked tokens.
    * @param _token - address of the token to withdraw tokens for.
    * @param _amount - amount of tokens to withdraw.
    * @param _withdrawnReward - the amount of already accumulated rewards to withdraw.
    */
    function withdrawTokens(address _token, uint256 _amount, uint256 _withdrawnReward) external;

    /**
    * @dev Function for withdrawing rewards.
    * @param _token - address of the staked tokens contract.
    * @param _amount - amount of rewards to withdraw.
    */
    function withdrawRewards(address _token, uint256 _amount) external;

    /**
     * @dev Function for retrieving the amount of tokens staked by account for the specific token contract.
     * @param _token - address of the contract which tokens are staked.
     * @param _account - address of the account.
     */
    function balanceOf(address _token, address _account) external view returns (uint256);

    /**
    * @dev Function for retrieving current reward of the account for the specific token contract.
    * Can be negative in case of penalty.
    * @param _token - address of the contract which tokens are staked.
    * @param _account - address of the account to retrieve the reward for.
    */
    function rewardOf(address _token, address _account) external view returns (int256);
}
