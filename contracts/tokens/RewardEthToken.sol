// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title RewardEthToken
 *
 * @dev RewardEthToken contract stores pool reward tokens.
 */
contract RewardEthToken is IRewardEthToken, OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for uint256;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the BalanceReporters contract.
    address private balanceReporters;

    // @dev Address of the StakedTokens contract.
    address private stakedTokens;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) public override checkpoints;

    // @dev Address of the maintainer, where the fee will be paid.
    address public override maintainer;

    // @dev Maintainer percentage fee.
    uint256 public override maintainerFee;

    // @dev Total amount of rewards.
    uint128 public override totalRewards;

    // @dev Reward per token for user reward calculation.
    uint128 public override rewardPerToken;

    // @dev Last rewards update timestamp by balance reporters.
    uint64 public override updateTimestamp;

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
        external override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init("StakeWise Reward ETH", "rwETH");
        __ERC20Permit_init("StakeWise Reward ETH");
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
        require(_newMaintainerFee < 10000, "RewardEthToken: invalid fee");
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

        uint256 periodRewardPerToken = uint256(rewardPerToken).sub(cp.rewardPerToken);
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
        return uint256(cp.reward).add(deposit.mul(periodRewardPerToken).div(1e18));
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardEthToken: invalid sender");
        require(recipient != address(0), "RewardEthToken: invalid receiver");

        uint128 _rewardPerToken = rewardPerToken; // gas savings
        Checkpoint memory senderCheckpoint = Checkpoint(
            balanceOf(sender).sub(amount, "RewardEthToken: invalid amount").toUint128(),
            _rewardPerToken
        );
        Checkpoint memory recipientCheckpoint = Checkpoint(
            balanceOf(recipient).add(amount).toUint128(),
            _rewardPerToken
        );

        checkpoints[sender] = senderCheckpoint;
        checkpoints[recipient] = recipientCheckpoint;

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        Checkpoint memory checkpoint = Checkpoint(balanceOf(account).toUint128(), rewardPerToken);
        checkpoints[account] = checkpoint;
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoints}.
     */
    function updateRewardCheckpoints(address account1, address account2) external override {
        uint128 _rewardPerToken = rewardPerToken; // gas savings
        Checkpoint memory checkpoint1 = Checkpoint(balanceOf(account1).toUint128(), _rewardPerToken);
        Checkpoint memory checkpoint2 = Checkpoint(balanceOf(account2).toUint128(), _rewardPerToken);

        checkpoints[account1] = checkpoint1;
        checkpoints[account2] = checkpoint2;
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(uint256 newTotalRewards) external override {
        require(msg.sender == balanceReporters, "RewardEthToken: access denied");

        uint256 periodRewards = newTotalRewards.sub(totalRewards, "RewardEthToken: invalid new total rewards");
        if (periodRewards == 0) {
            // no new rewards
            return;
        }

        // calculate reward per token used for account reward calculation
        uint256 maintainerReward = periodRewards.mul(maintainerFee).div(10000);
        uint256 newRewardPerToken = uint256(rewardPerToken).add(periodRewards.sub(maintainerReward).mul(1e18).div(stakedEthToken.totalDeposits()));

        // update maintainer's reward
        Checkpoint memory checkpoint = Checkpoint(
            balanceOf(maintainer).add(maintainerReward).toUint128(),
            newRewardPerToken.toUint128()
        );
        checkpoints[maintainer] = checkpoint;

        totalRewards = newTotalRewards.toUint128();
        rewardPerToken = newRewardPerToken.toUint128();
        // solhint-disable-next-line not-rely-on-time
        updateTimestamp = block.timestamp.toUint64();

        emit RewardsUpdated(periodRewards, newTotalRewards, newRewardPerToken, updateTimestamp);
    }

    /**
     * @dev See {IRewardEthToken-claimRewards}.
     */
    function claimRewards(address tokenContract, uint256 claimedRewards) external override {
        require(msg.sender == stakedTokens, "RewardEthToken: access denied");
        _transfer(tokenContract, stakedTokens, claimedRewards);
    }
}
