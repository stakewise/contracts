// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IStakedTokens.sol";

/**
 * @title StakedTokens
 *
 * @dev StakedTokens contract allows users to continue earning rewards
 * while locking tokens which inherit staking rewards.
 */
contract StakedTokens is IStakedTokens, OwnablePausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20 for IERC20;

    // @dev Maps token address to its information.
    mapping(address => Token) public override tokens;

    // @dev Maps token address to their holders' reward rates.
    mapping(address => mapping(address => uint256)) private rewardRates;

    // @dev Maps token addresses to their holders' balances.
    mapping(address => mapping(address => uint256)) private balances;

    // @dev Address of the RewardEthToken contract.
    address private rewardEthToken;

    /**
     * @dev See {IStakedTokens-initialize}.
     */
    function initialize(address _admin, address _rewardEthToken) public override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ReentrancyGuard_init_unchained();
        rewardEthToken = _rewardEthToken;
    }

    /**
     * @dev See {IStakedTokens-toggleTokenContract}.
     */
    function toggleTokenContract(address _token, bool _isEnabled) external override onlyAdmin {
        require(_token != address(0), "StakedTokens: invalid token address");

        // support token
        Token storage token = tokens[_token];
        token.enabled = _isEnabled;

        // update token's reward
        updateTokenRewards(_token);

        emit TokenToggled(_token, _isEnabled);
    }

    /**
     * @dev See {IStakedTokens-stakeTokens}.
     */
    function stakeTokens(address _token, uint256 _amount) external override nonReentrant whenNotPaused {
        Token storage token = tokens[_token];
        require(token.enabled, "StakedTokens: token is not supported");

        // update token's reward
        updateTokenRewards(_token);

        // withdraw account's current rewards
        _withdrawRewards(_token, msg.sender);

        // update account's balance
        token.totalSupply = token.totalSupply.add(_amount);
        balances[_token][msg.sender] = balances[_token][msg.sender].add(_amount);

        // emit event
        emit TokensStaked(_token, msg.sender, _amount);

        // lock account's tokens
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev See {IStakedTokens-withdrawTokens}.
     */
    function withdrawTokens(address _token, uint256 _amount) external override nonReentrant whenNotPaused {
        // update token's reward
        updateTokenRewards(_token);

        // withdraw account's current rewards
        _withdrawRewards(_token, msg.sender);

        // update account's balance
        Token storage token = tokens[_token];
        token.totalSupply = token.totalSupply.sub(_amount, "StakedTokens: invalid tokens amount");
        balances[_token][msg.sender] = balances[_token][msg.sender].sub(_amount, "StakedTokens: invalid tokens amount");

        // emit event
        emit TokensWithdrawn(_token, msg.sender, _amount);

        // release account's tokens
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    /**
     * @dev See {IStakedTokens-withdrawRewards}.
     */
    function withdrawRewards(address _token) external override nonReentrant whenNotPaused {
        // update token's reward
        updateTokenRewards(_token);

        // withdraw account's current rewards
        _withdrawRewards(_token, msg.sender);
    }

    /**
     * @dev See {IStakedTokens-balanceOf}.
     */
    function balanceOf(address _token, address _account) external view override returns (uint256) {
        return balances[_token][_account];
    }

    /**
     * @dev See {IStakedTokens-rewardRateOf}.
     */
    function rewardRateOf(address _token, address _account) external view override returns (uint256) {
        return rewardRates[_token][_account];
    }

    /**
     * @dev See {IStakedTokens-rewardOf}.
     */
    function rewardOf(address _token, address _account) external override view returns (uint256) {
        Token memory token = tokens[_token];
        if (token.totalSupply == 0) {
            return 0;
        }

        // calculate period reward
        uint256 tokenPeriodReward = IERC20(rewardEthToken).balanceOf(_token);
        uint256 accountRewardRate = rewardRates[_token][_account];
        uint256 accountBalance = balances[_token][_account];
        if (tokenPeriodReward == 0) {
            return accountBalance.mul(token.rewardRate.sub(accountRewardRate)).div(1e18);
        }

        // calculate reward per token used for account reward calculation
        uint256 rewardRate = token.rewardRate.add(tokenPeriodReward.mul(1e18).div(token.totalSupply));

        // calculate period reward
        return accountBalance.mul(rewardRate.sub(accountRewardRate)).div(1e18);
    }

    /**
    * @dev Function to update accumulated rewards for token.
    * @param _token - address of the token to update rewards for.
    */
    function updateTokenRewards(address _token) private {
        Token storage token = tokens[_token];
        uint256 claimedRewards = IRewardEthToken(rewardEthToken).balanceOf(_token);
        if (token.totalSupply == 0 || claimedRewards == 0) {
            // no staked tokens or rewards
            return;
        }

        // calculate reward per token used for account reward calculation
        token.rewardRate = token.rewardRate.add(claimedRewards.mul(1e18).div(token.totalSupply));
        token.totalRewards = token.totalRewards.add(claimedRewards);

        // withdraw rewards from token
        IRewardEthToken(rewardEthToken).claimRewards(_token, claimedRewards);
    }

    /**
    * @dev Function to withdraw account's accumulated rewards.
    * @param _token - address of the staked tokens contract.
    * @param _account - account to update.
    */
    function _withdrawRewards(address _token, address _account) private {
        Token storage token = tokens[_token];
        uint256 accountRewardRate = rewardRates[_token][_account];
        if (token.rewardRate == accountRewardRate) {
            // nothing to withdraw
            return;
        }

        // update account reward rate
        rewardRates[_token][_account] = token.rewardRate;

        uint256 accountBalance = balances[_token][_account];
        if (accountBalance == 0) {
            // no staked tokens
            return;
        }

        // calculate period reward
        uint256 periodReward = accountBalance.mul(token.rewardRate.sub(accountRewardRate)).div(1e18);

        // withdraw rewards
        token.totalRewards = token.totalRewards.sub(periodReward);
        emit RewardWithdrawn(_token, _account, periodReward);

        IERC20(rewardEthToken).safeTransfer(_account, periodReward);
    }
}
