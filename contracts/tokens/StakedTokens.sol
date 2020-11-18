// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
    using SignedSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SafeERC20 for IERC20;

    // @dev Maps token address to whether it is supported or not.
    mapping(address => bool) public override supportedTokens;

    // @dev Maps address of the token to its total supply.
    mapping(address => uint256) private totalSupplies;

    // @dev Maps accounts' and tokens' addresses to their reward checkpoints.
    mapping(address => Checkpoint) private checkpoints;

    // @dev Maps token addresses to their holders' balances.
    mapping(address => mapping(address => uint256)) private balances;

    // @dev Maps token addresses to the amounts withdrawn by the accounts.
    mapping(address => uint256) private withdrawnRewards;

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
        supportedTokens[_token] = _isEnabled;

        // update token's checkpoint
        updateTokenCheckpoint(_token);

        emit TokenToggled(_token, _isEnabled);
    }

    /**
     * @dev See {IStakedTokens-stakeTokens}.
     */
    function stakeTokens(address _token, uint256 _amount, uint256 _withdrawnReward) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");
        require(supportedTokens[_token], "StakedTokens: token is not supported");
        require(IERC20(_token).balanceOf(msg.sender) >= _amount, "StakedTokens: invalid tokens amount");

        // update token's checkpoint
        updateTokenCheckpoint(_token);

        // update account's balance and withdrawn reward
        updateAccount(_token, msg.sender, balances[_token][msg.sender].add(_amount), _withdrawnReward);

        if (_withdrawnReward != 0) {
            // withdraw reward from token
            withdrawnRewards[_token] = withdrawnRewards[_token].add(_withdrawnReward);
            IRewardEthToken(rewardEthToken).claim(_token, msg.sender, _withdrawnReward);
            emit RewardWithdrawn(_token, msg.sender, _withdrawnReward);
        }

        // emit event
        emit TokensStaked(_token, msg.sender, _amount);

        // lock account's tokens
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev See {IStakedTokens-withdrawTokens}.
     */
    function withdrawTokens(address _token, uint256 _amount, uint256 _withdrawnReward) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");
        require(_withdrawnReward == 0 || supportedTokens[_token], "StakedTokens: token is not supported");

        // update token's checkpoint
        updateTokenCheckpoint(_token);

        // update account's balance and withdrawn reward
        updateAccount(
            _token,
            msg.sender,
            balances[_token][msg.sender].sub(_amount, "StakedTokens: invalid tokens amount"),
            _withdrawnReward
        );

        if (_withdrawnReward > 0) {
            // claim reward from token
            withdrawnRewards[_token] = withdrawnRewards[_token].add(_withdrawnReward);
            IRewardEthToken(rewardEthToken).claim(_token, msg.sender, _withdrawnReward);
            emit RewardWithdrawn(_token, msg.sender, _withdrawnReward);
        }

        // emit event
        emit TokensWithdrawn(_token, msg.sender, _amount);

        // release account's tokens
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    /**
     * @dev See {IStakedTokens-withdrawRewards}.
     */
    function withdrawRewards(address _token, uint256 _amount) external override lock {
        require(!settings.pausedContracts(address(this)), "StakedTokens: contract is paused");
        require(supportedTokens[_token], "StakedTokens: token is not supported");

        // update token's checkpoint
        updateTokenCheckpoint(_token);

        // update account's balance and withdrawn reward
        updateAccount(_token, msg.sender, balances[_token][msg.sender], _amount);

        // claim reward from token
        withdrawnRewards[_token] = withdrawnRewards[_token].add(_amount);

        // emit event
        emit RewardWithdrawn(_token, msg.sender, _amount);

        // claim rewards
        IRewardEthToken(rewardEthToken).claim(_token, msg.sender, _amount);
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
    function rewardOf(address _token, address _account) public override view returns (int256) {
        Checkpoint memory tokenCheckpoint = checkpoints[_token];

        // calculate reward per token
        int256 rewardPerToken;
        int256 newTotalRewards = IRewardEthToken(rewardEthToken).rewardOf(_token).add(withdrawnRewards[_token].toInt256());
        int256 periodRewards = newTotalRewards.sub(tokenCheckpoint.totalRewards);
        uint256 totalSupply = totalSupplies[_token];
        if (periodRewards == 0 || totalSupply == 0) {
            rewardPerToken = tokenCheckpoint.rewardPerToken;
        } else {
            rewardPerToken = tokenCheckpoint.rewardPerToken.add(periodRewards.mul(1e18).div(totalSupply.toInt256()));
        }

        // calculate current reward of the account
        Checkpoint memory accountCheckpoint = checkpoints[_account];

        int256 periodReward;
        uint256 accountBalance = balances[_token][_account];
        if (accountBalance != 0 && rewardPerToken != accountCheckpoint.rewardPerToken) {
            periodReward = accountBalance.toInt256().mul(rewardPerToken.sub(accountCheckpoint.rewardPerToken)).div(1e18);
        }

        return accountCheckpoint.totalRewards.add(periodReward);
    }

    /**
    * @dev Function to update accumulated rewards for token.
    * @param _token - address of the token to update rewards for.
    */
    function updateTokenCheckpoint(address _token) private {
        Checkpoint storage checkpoint = checkpoints[_token];

        int256 newTotalRewards = IRewardEthToken(rewardEthToken).rewardOf(_token).add(withdrawnRewards[_token].toInt256());
        int256 periodRewards = newTotalRewards.sub(checkpoint.totalRewards);
        uint256 totalSupply = totalSupplies[_token];
        if (totalSupply == 0 || periodRewards == 0) {
            return;
        }

        // calculate reward per token used for account reward calculation
        checkpoint.rewardPerToken = checkpoint.rewardPerToken.add(periodRewards.mul(1e18).div(totalSupply.toInt256()));
        checkpoint.totalRewards = newTotalRewards;
    }

    /**
    * @dev Function to update staked balances and accumulated rewards for the account.
    * @param _token - address of the staked tokens contract.
    * @param _account - account to update.
    * @param _newBalance - account's new balance.
    * @param _withdrawnReward - amount of tokens account wants to withdraw.
    */
    function updateAccount(address _token, address _account, uint256 _newBalance, uint256 _withdrawnReward) private {
        // fetch token and account checkpoints
        Checkpoint memory tokenCheckpoint = checkpoints[_token];
        Checkpoint storage accountCheckpoint = checkpoints[_account];

        // calculate current reward of the account
        int256 periodReward;
        uint256 accountBalance = balances[_token][_account];
        if (accountBalance != 0 && tokenCheckpoint.rewardPerToken != accountCheckpoint.rewardPerToken) {
            periodReward = accountBalance.toInt256().mul(tokenCheckpoint.rewardPerToken.sub(accountCheckpoint.rewardPerToken)).div(1e18);
        }

        // update account checkpoint
        int256 newTotalRewards = accountCheckpoint.totalRewards.add(periodReward).sub(_withdrawnReward.toInt256());
        require(newTotalRewards >= 0, "StakedTokens: cannot update account with negative rewards");
        accountCheckpoint.rewardPerToken = tokenCheckpoint.rewardPerToken;
        accountCheckpoint.totalRewards = newTotalRewards;

        // update total staked amount of the token
        if (accountBalance != _newBalance) {
            totalSupplies[_token] = totalSupplies[_token].add(_newBalance).sub(accountBalance);
            balances[_token][_account] = _newBalance;
        }
    }
}
