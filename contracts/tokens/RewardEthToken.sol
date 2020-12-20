// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "./ERC20.sol";

/**
 * @title RewardEthToken
 *
 * @dev RewardEthToken contract stores pool reward tokens.
 */
contract RewardEthToken is IRewardEthToken, OwnablePausableUpgradeable, ERC20 {
    using SafeMathUpgradeable for uint256;

    // @dev Last rewards update timestamp by balance reporters.
    uint256 public override updateTimestamp;

    // @dev Total amount of rewards.
    uint256 public override totalRewards;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) public override checkpoints;

    // @dev Reward per token for user reward calculation.
    uint256 public override rewardPerToken;

    // @dev Maintainer percentage fee.
    uint256 public override maintainerFee;

    // @dev Address of the maintainer, where the fee will be paid.
    address public override maintainer;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the BalanceReporters contract.
    address private balanceReporters;

    // @dev Address of the StakedTokens contract.
    address private stakedTokens;

    /**
      * @dev See {IRewardEthToken-initialize}.
      */
    function initialize(
        address _admin,
        address _stakedEthToken,
        address _balanceReporters,
        address _stakedTokens,
        address _maintainer,
        uint256 _maintainerFee
    )
        public override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init_unchained("StakeWise Reward ETH", "rwETH");
        stakedEthToken = IStakedEthToken(_stakedEthToken);
        balanceReporters = _balanceReporters;
        stakedTokens = _stakedTokens;

        // set maintainer
        maintainer = _maintainer;
        emit MaintainerUpdated(_maintainer);

        // set maintainer fee
        maintainerFee = _maintainerFee;
        emit MaintainerFeeUpdated(_maintainerFee);
    }

    /**
     * @dev See {IRewardEthToken-setMaintainer}.
     */
    function setMaintainer(address _newMaintainer) external override onlyAdmin {
        maintainer = _newMaintainer;
        emit MaintainerUpdated(_newMaintainer);
    }

    /**
     * @dev See {IRewardEthToken-setMaintainerFee}.
     */
    function setMaintainerFee(uint256 _newMaintainerFee) external override onlyAdmin {
        require(_newMaintainerFee < 10000, "RewardEthToken: invalid new maintainer fee");
        maintainerFee = _newMaintainerFee;
        emit MaintainerFeeUpdated(_newMaintainerFee);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return totalRewards;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view override returns (uint256) {
        Checkpoint memory cp = checkpoints[account];

        uint256 periodRewardPerToken = rewardPerToken.sub(cp.rewardPerToken);
        if (periodRewardPerToken == 0) {
            // no new rewards
            return cp.reward;
        }

        uint256 deposit = stakedEthToken.balanceOf(account);
        if (deposit == 0) {
            // no deposit amount
            return cp.reward;
        }

        // return checkpoint reward + current reward
        return cp.reward.add(deposit.mul(periodRewardPerToken).div(1e18));
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardEthToken: transfer from the zero address");
        require(recipient != address(0), "RewardEthToken: transfer to the zero address");

        checkpoints[sender] = Checkpoint(rewardPerToken, balanceOf(sender).sub(amount, "RewardEthToken: invalid amount"));
        checkpoints[recipient] = Checkpoint(rewardPerToken, balanceOf(recipient).add(amount));

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        checkpoints[account] = Checkpoint(rewardPerToken, balanceOf(account));
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(uint256 newTotalRewards) external override {
        require(msg.sender == balanceReporters, "RewardEthToken: permission denied");

        uint256 periodRewards = newTotalRewards.sub(totalRewards, "RewardEthToken: invalid new total rewards");
        if (periodRewards == 0) {
            // no new rewards
            return;
        }

        // calculate reward per token used for account reward calculation
        uint256 maintainerReward = periodRewards.mul(maintainerFee).div(10000);
        rewardPerToken = rewardPerToken.add(periodRewards.sub(maintainerReward).mul(1e18).div(stakedEthToken.totalDeposits()));

        // update maintainer's reward
        checkpoints[maintainer] = Checkpoint(
            rewardPerToken,
            balanceOf(maintainer).add(maintainerReward)
        );

        // solhint-disable-next-line not-rely-on-time
        updateTimestamp = block.timestamp;
        totalRewards = newTotalRewards;

        emit RewardsUpdated(periodRewards, newTotalRewards, rewardPerToken, updateTimestamp);
    }

    /**
     * @dev See {IRewardEthToken-claimRewards}.
     */
    function claimRewards(address tokenContract, uint256 claimedRewards) external override {
        require(msg.sender == stakedTokens, "RewardEthToken: permission denied");
        _transfer(tokenContract, stakedTokens, claimedRewards);
    }
}
