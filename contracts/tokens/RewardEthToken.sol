// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "../interfaces/IStakingEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/ISettings.sol";
import "./BaseERC20.sol";

/**
 * @title RewardEthToken
 *
 * @dev RewardEthToken contract stores pool reward tokens.
 */
contract RewardEthToken is IRewardEthToken, BaseERC20 {
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;

    // @dev Last rewards update timestamp by balance reporters.
    uint256 public override updateTimestamp;

    // @dev Total amount of rewards. Can be negative in case of penalties.
    int256 public override totalRewards;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) private checkpoints;

    // @dev Address of the StakingEthToken contract.
    IStakingEthToken private stakingEthToken;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the BalanceReporters contract.
    address private balanceReporters;

    // @dev Reward rate for user reward calculation. Can be negative in case of the penalties.
    int256 private rewardRate;

    /**
      * @dev See {IRewardEthToken-initialize}.
      */
    function initialize(address _stakingEthToken, address _settings, address _balanceReporters) public override initializer {
        super.initialize("StakeWise Reward ETH", "rwETH");
        stakingEthToken = IStakingEthToken(_stakingEthToken);
        settings = ISettings(_settings);
        balanceReporters = _balanceReporters;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return totalRewards > 0 ? totalRewards.toUint256() : 0;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view override returns (uint256) {
        int256 balance = rewardOf(account);
        return balance > 0 ? balance.toUint256() : 0;
    }

    /**
      * @dev See {IRewardEthToken-rewardOf}.
      */
    function rewardOf(address account) public view override returns (int256) {
        Checkpoint memory cp = checkpoints[account];

        int256 curReward;
        uint256 deposit = stakingEthToken.depositOf(account);
        if (deposit != 0) {
            // calculate current reward of the account
            curReward = deposit.toInt256().mul(rewardRate.sub(cp.rewardRate)).div(1 ether);
        }

        // return checkpoint reward + current reward
        return cp.reward.add(curReward);
    }

    /**
     * @dev See {BaseERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override {
        require(sender != address(0), "RewardEthToken: transfer from the zero address");
        require(recipient != address(0), "RewardEthToken: transfer to the zero address");
        require(!settings.pausedContracts(address(this)), "RewardEthToken: contract is paused");

        uint256 senderReward = balanceOf(sender);
        require(amount > 0 && senderReward >= amount, "RewardEthToken: invalid amount");
        checkpoints[sender] = Checkpoint(rewardRate, senderReward.sub(amount).toInt256());

        checkpoints[recipient] = Checkpoint(rewardRate, rewardOf(recipient).add(amount.toInt256()));

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        require(msg.sender == address(stakingEthToken), "RewardEthToken: permission denied");
        checkpoints[account] = Checkpoint(rewardRate, rewardOf(account));
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(int256 newTotalRewards) external override {
        require(msg.sender == balanceReporters, "RewardEthToken: permission denied");

        int256 periodRewards = newTotalRewards.sub(totalRewards);
        int256 maintainerReward;
        if (periodRewards > 0) {
            maintainerReward = periodRewards.mul(settings.maintainerFee().toInt256()).div(10000);
        }

        // calculate reward rate used for account reward calculation
        rewardRate = rewardRate.add(periodRewards.sub(maintainerReward).mul(1 ether).div(stakingEthToken.totalDeposits().toInt256()));

        // deduct maintainer fee if period reward is positive
        if (maintainerReward > 0) {
           address maintainer = settings.maintainer();
           checkpoints[maintainer] = Checkpoint(
                rewardRate,
                rewardOf(maintainer).add(maintainerReward)
           );
        }

        // solhint-disable-next-line not-rely-on-time
        updateTimestamp = block.timestamp;
        totalRewards = newTotalRewards;

        emit RewardsUpdated(periodRewards, newTotalRewards, rewardRate, updateTimestamp);
    }
}
