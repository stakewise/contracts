// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
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
    using SignedSafeMathUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using SafeCastUpgradeable for int256;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) public override checkpoints;

    // @dev Maintainer percentage fee.
    uint128 public override maintainerFee;

    // @dev Last rewards update timestamp by balance reporters.
    uint128 public override updateTimestamp;

    // @dev Reward per token for user reward calculation. Can be negative in case of the penalties.
    int128 public override rewardPerToken;

    // @dev Total amount of rewards. Can be negative in case of penalties.
    int128 public override totalRewards;

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
        uint128 _maintainerFee
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
    function setMaintainerFee(uint128 _newMaintainerFee) external override onlyAdmin {
        require(_newMaintainerFee < 10000, "RewardEthToken: invalid new maintainer fee");
        maintainerFee = _newMaintainerFee;
        emit MaintainerFeeUpdated(_newMaintainerFee);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        int256 _totalRewards = totalRewards;
        return _totalRewards > 0 ? uint256(_totalRewards) : 0;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        int256 balance = rewardOf(account);
        return balance > 0 ? uint256(balance) : 0;
    }

    /**
     * @dev See {IRewardEthToken-rewardOf}.
     */
    function rewardOf(address account) public view override returns (int256) {
        Checkpoint memory cp = checkpoints[account];

        int256 periodRewardPerToken = int256(rewardPerToken).sub(int256(cp.rewardPerToken));
        if (periodRewardPerToken == 0) {
            // no new rewards
            return int256(cp.reward);
        }

        uint256 deposit = stakedEthToken.depositOf(account);
        if (deposit == 0) {
            // no deposit amount
            return int256(cp.reward);
        }

        // calculate current reward of the account
        int256 curReward = deposit.toInt256().mul(periodRewardPerToken).div(1e18);
        if (periodRewardPerToken < 0) {
            // fixes precision issue in case of the account penalty
            curReward = curReward.sub(1);
        }

        // return checkpoint reward + current reward
        return int256(cp.reward).add(curReward);
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardEthToken: transfer from the zero address");
        require(recipient != address(0), "RewardEthToken: transfer to the zero address");

        int128 curRewardPerToken = rewardPerToken;
        checkpoints[sender] = Checkpoint(curRewardPerToken, int256(rewardOf(sender).toUint256().sub(amount, "RewardEthToken: invalid amount")).toInt128());
        checkpoints[recipient] = Checkpoint(curRewardPerToken, rewardOf(recipient).add(amount.toInt256()).toInt128());

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        checkpoints[account] = Checkpoint(rewardPerToken, rewardOf(account).toInt128());
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(int128 newTotalRewards) external override {
        require(msg.sender == balanceReporters, "RewardEthToken: permission denied");

        int256 periodRewards = int256(newTotalRewards).sub(totalRewards);
        int256 maintainerReward;
        if (periodRewards > 0) {
            maintainerReward = periodRewards.mul(int256(maintainerFee)).div(10000);
        }

        // calculate reward per token used for account reward calculation
        int128 newRewardPerToken = int256(rewardPerToken).add(periodRewards.sub(maintainerReward).mul(1e18).div(stakedEthToken.totalDeposits().toInt256())).toInt128();

        // deduct maintainer fee if period reward is positive
        if (maintainerReward > 0) {
           checkpoints[maintainer] = Checkpoint(
                newRewardPerToken,
                rewardOf(maintainer).add(maintainerReward).toInt128()
           );
        }

        // solhint-disable-next-line not-rely-on-time
        uint128 newTimestamp = block.timestamp.toUint128();
        updateTimestamp = newTimestamp;
        totalRewards = newTotalRewards;
        rewardPerToken = newRewardPerToken;

        emit RewardsUpdated(periodRewards.toInt128(), newTotalRewards, newRewardPerToken, newTimestamp);
    }

    /**
     * @dev See {IRewardEthToken-claimRewards}.
     */
    function claimRewards(address tokenContract, uint256 claimedRewards) external override {
        require(msg.sender == stakedTokens, "RewardEthToken: permission denied");
        _transfer(tokenContract, stakedTokens, claimedRewards);
    }
}
