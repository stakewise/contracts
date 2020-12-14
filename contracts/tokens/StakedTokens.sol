// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IStakedTokens.sol";
import "../interfaces/IAdmins.sol";

/**
 * @title StakedTokens
 *
 * @dev StakedTokens contract allows users to continue earning rewards
 * while locking tokens which inherit staking rewards.
 */
contract StakedTokens is IStakedTokens, Initializable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // @dev Maps token address to its information.
    mapping(address => Token) public override tokens;

    // @dev Maps account and token addresses to their reward rate.
    mapping(address => uint256) public override rewardRates;

    // @dev Maps token addresses to their holders' balances.
    mapping(address => mapping(address => uint256)) private balances;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the RewardEthToken contract.
    address private rewardEthToken;

    // @dev Indicates whether the calling function is locked.
    uint256 private unlocked;

    modifier lock() {
        require(unlocked == 1, "StakedTokens: locked");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    /**
     * @dev See {IStakedTokens-initialize}.
     */
    function initialize(address _settings, address _admins, address _rewardEthToken) public override initializer {
        settings = ISettings(_settings);
        admins = IAdmins(_admins);
        rewardEthToken = _rewardEthToken;
        unlocked = 1;
    }

    /**
     * @dev See {IStakedTokens-toggleTokenContract}.
     */
    function toggleTokenContract(address _token, bool _isEnabled) external override {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");
        require(admins.isAdmin(msg.sender), "StakedTokens: permission denied");
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
    function stakeTokens(address _token, uint256 _amount) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");

        Token storage token = tokens[_token];
        require(token.enabled, "StakedTokens: token is not supported");
        require(IERC20(_token).balanceOf(msg.sender) >= _amount, "StakedTokens: invalid tokens amount");

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
    function withdrawTokens(address _token, uint256 _amount) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");

        Token storage token = tokens[_token];

        if (token.enabled) {
            // update token's reward
            updateTokenRewards(_token);
        }

        // withdraw account's current rewards
        _withdrawRewards(_token, msg.sender);

        // update account's balance
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
    function withdrawRewards(address _token) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");
        require(tokens[_token].enabled, "StakedTokens: token is not supported");

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
     * @dev See {IStakedTokens-rewardOf}.
     */
    function rewardOf(address _token, address _account) public override view returns (uint256) {
        uint256 tokenRewardRate = rewardRates[_token];
        uint256 accountRewardRate = rewardRates[_account];

        Token memory token = tokens[_token];
        if (token.totalSupply == 0) {
            return 0;
        }

        // calculate period reward
        uint256 periodReward = IERC20(rewardEthToken).balanceOf(_token);
        uint256 accountBalance = balances[_token][_account];
        if (periodReward == 0) {
            return accountBalance.mul(tokenRewardRate.sub(accountRewardRate)).div(1e18);
        }

        // calculate reward per token used for account reward calculation
        uint256 rewardRate = tokenRewardRate.add(periodReward.mul(1e18).div(token.totalSupply));

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
            // no staked tokens
            return;
        }

        // withdraw rewards from token
        IRewardEthToken(rewardEthToken).claimRewards(_token, claimedRewards);

        // calculate reward per token used for account reward calculation
        rewardRates[_token] = rewardRates[_token].add(claimedRewards.mul(1e18).div(token.totalSupply));
        token.totalRewards = token.totalRewards.add(claimedRewards);
    }

    /**
    * @dev Function to withdraw account's accumulated rewards.
    * @param _token - address of the staked tokens contract.
    * @param _account - account to update.
    */
    function _withdrawRewards(address _token, address _account) private {
        // fetch token and account reward rates
        uint256 tokenRewardRate = rewardRates[_token];
        uint256 accountRewardRate = rewardRates[_account];
        if (tokenRewardRate == accountRewardRate) {
            // nothing to withdraw
            return;
        }

        // calculate period reward
        uint256 accountBalance = balances[_token][_account];
        uint256 periodReward = accountBalance.mul(tokenRewardRate.sub(accountRewardRate)).div(1e18);

        // update account reward rate
        rewardRates[_account] = tokenRewardRate;

        // withdraw rewards
        Token storage token = tokens[_token];
        token.totalRewards = token.totalRewards.sub(periodReward);
        IERC20(rewardEthToken).safeTransfer(_account, periodReward);
        emit RewardWithdrawn(_token, _account, periodReward);
    }
}
