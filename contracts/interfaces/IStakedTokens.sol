// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the StakedTokens contract.
 */
interface IStakedTokens {
    /**
    * @dev Structure for storing information about token.
    * @param enabled - defines whether the token is supported.
    * @param totalSupply - total staked amount of the token.
    * @param totalRewards - last synced total rewards.
    * @param rewardRate - token reward rate.
    */
    struct Token {
        bool enabled;
        uint256 totalSupply;
        uint256 totalRewards;
        uint256 rewardRate;
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
    * @param isEnabled - defines whether the token is enabled or not.
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
    * @dev Function for retrieving token's data.
    * @param _token - address of the token to retrieve.
    */
    function tokens(address _token) external view returns (bool, uint256, uint256, uint256);

    /**
    * @dev Constructor for initializing the StakedTokens contract.
    * @param _admin - address of the contract admin.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    */
    function initialize(address _admin, address _rewardEthToken) external;

   /**
   * @dev Function for enabling or disabling token contract. Can only be called by an admin user.
   * @param _token - address of the token to toggle.
   */
    function toggleTokenContract(address _token, bool _isSupported) external;

    /**
    * @dev Function for staking tokens which inherit rewards.
    * @param _token - address of the token to stake tokens for.
    * @param _amount - amount of tokens to stake.
    */
    function stakeTokens(address _token, uint256 _amount) external;

    /**
    * @dev Function for withdrawing staked tokens.
    * @param _token - address of the token to withdraw tokens for.
    * @param _amount - amount of tokens to withdraw.
    */
    function withdrawTokens(address _token, uint256 _amount) external;

    /**
    * @dev Function for withdrawing rewards.
    * @param _token - address of the staked tokens contract.
    */
    function withdrawRewards(address _token) external;

    /**
     * @dev Function for retrieving the amount of tokens staked by account for the specific token contract.
     * @param _token - address of the contract which tokens are staked.
     * @param _account - address of the account.
     */
    function balanceOf(address _token, address _account) external view returns (uint256);

    /**
    * @dev Function for retrieving account reward rate.
    * @param _token - address of the contract which tokens are staked.
    * @param _account - address of the account to retrieve reward rate for.
    */
    function rewardRateOf(address _token, address _account) external view returns (uint256);

    /**
    * @dev Function for retrieving current reward of the account for the specific token contract.
    * @param _token - address of the contract which tokens are staked.
    * @param _account - address of the account to retrieve the reward for.
    */
    function rewardOf(address _token, address _account) external view returns (uint256);
}
