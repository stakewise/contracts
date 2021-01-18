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

    // @dev Address of the Oracles contract.
    address private oracles;

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

    // @dev Last rewards update timestamp by oracles.
    uint256 public override lastUpdateTimestamp;

    /**
      * @dev See {IRewardEthToken-initialize}.
      */
    function initialize(
        address _admin,
        address _stakedEthToken,
        address _oracles,
        address _maintainer,
        uint256 _maintainerFee
    )
        external override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init("StakeWise Reward ETH2", "rETH2");
        __ERC20Permit_init("StakeWise Reward ETH2");
        stakedEthToken = IStakedEthToken(_stakedEthToken);
        oracles = _oracles;

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
        // solhint-disable-next-line not-rely-on-time, reason-string
        require(block.timestamp > lastUpdateTimestamp, "RewardEthToken: cannot transfer during rewards update");

        uint128 _rewardPerToken = rewardPerToken; // gas savings
        checkpoints[sender] = Checkpoint(
            balanceOf(sender).sub(amount, "RewardEthToken: invalid amount").toUint128(),
            _rewardPerToken
        );
        checkpoints[recipient] = Checkpoint(
            balanceOf(recipient).add(amount).toUint128(),
            _rewardPerToken
        );

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        checkpoints[account] = Checkpoint(balanceOf(account).toUint128(), rewardPerToken);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoints}.
     */
    function updateRewardCheckpoints(address account1, address account2) external override {
        uint128 _rewardPerToken = rewardPerToken; // gas savings
        checkpoints[account1] = Checkpoint(balanceOf(account1).toUint128(), _rewardPerToken);
        checkpoints[account2] = Checkpoint(balanceOf(account2).toUint128(), _rewardPerToken);
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(uint256 newTotalRewards) external override {
        require(msg.sender == oracles, "RewardEthToken: access denied");

        uint256 periodRewards = newTotalRewards.sub(totalRewards, "RewardEthToken: invalid new total rewards");
        if (periodRewards == 0) {
            // no new rewards
            return;
        }

        // calculate reward per token used for account reward calculation
        uint256 maintainerReward = periodRewards.mul(maintainerFee).div(10000);
        uint256 newRewardPerToken = uint256(rewardPerToken).add(periodRewards.sub(maintainerReward).mul(1e18).div(stakedEthToken.totalDeposits()));

        // update maintainer's reward
        checkpoints[maintainer] = Checkpoint(
            balanceOf(maintainer).add(maintainerReward).toUint128(),
            newRewardPerToken.toUint128()
        );

        (totalRewards, rewardPerToken) = (newTotalRewards.toUint128(), newRewardPerToken.toUint128());
        // solhint-disable-next-line not-rely-on-time
        lastUpdateTimestamp = block.timestamp;

        emit RewardsUpdated(periodRewards, newTotalRewards, newRewardPerToken, lastUpdateTimestamp);
    }
}
