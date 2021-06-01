// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IOracles.sol";
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

    // @dev Last rewards update block number by oracles.
    uint256 public override lastUpdateBlockNumber;

    // @dev Address of the MerkleDistributor contract.
    address public override merkleDistributor;

    // @dev Maps account address to whether rewards are distributed through the merkle distributor.
    mapping(address => bool) public override rewardsDisabled;

    /**
     * @dev See {IRewardEthToken-upgrade}.
     */
    function upgrade(address _merkleDistributor, uint256 _lastUpdateBlockNumber) external override onlyAdmin whenPaused {
        require(merkleDistributor == address(0), "RewardEthToken: already upgraded");
        merkleDistributor = _merkleDistributor;
        lastUpdateBlockNumber = _lastUpdateBlockNumber;
        updateRewardCheckpoint(address(0));
    }

    /**
     * @dev See {IRewardEthToken-setRewardsDisabled}.
     */
    function setRewardsDisabled(address account, bool isDisabled) external override {
        require(msg.sender == address(stakedEthToken), "RewardEthToken: access denied");
        require(rewardsDisabled[account] != isDisabled, "RewardEthToken: value did not change");
        require(block.number > lastUpdateBlockNumber, "RewardEthToken: cannot disable during rewards update");

        uint128 _rewardPerToken = rewardPerToken;
        checkpoints[account] = Checkpoint({
            reward: _balanceOf(account, _rewardPerToken).toUint128(),
            rewardPerToken: _rewardPerToken
        });

        rewardsDisabled[account] = isDisabled;
        emit RewardsToggled(account, isDisabled);
    }

    /**
     * @dev See {IRewardEthToken-setMaintainer}.
     */
    function setMaintainer(address _newMaintainer) external override onlyAdmin {
        require(_newMaintainer != address(0), "RewardEthToken: invalid address");
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
    function balanceOf(address account) external view override returns (uint256) {
        return _balanceOf(account, rewardPerToken);
    }

    function _balanceOf(address account, uint256 _rewardPerToken) internal view returns (uint256) {
        Checkpoint memory cp = checkpoints[account];

        // skip calculating period reward when it has not changed or when the rewards are disabled
        if (_rewardPerToken == cp.rewardPerToken || rewardsDisabled[account]) return cp.reward;

        uint256 stakedEthAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedEthAmount = stakedEthToken.distributorPrincipal();
        } else {
            stakedEthAmount = stakedEthToken.balanceOf(account);
        }
        if (stakedEthAmount == 0) return cp.reward;

        // return checkpoint reward + current reward
        return _calculateNewReward(cp.reward, stakedEthAmount, _rewardPerToken.sub(cp.rewardPerToken));
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardEthToken: invalid sender");
        require(recipient != address(0), "RewardEthToken: invalid receiver");
        require(block.number > lastUpdateBlockNumber, "RewardEthToken: cannot transfer during rewards update");

        uint128 _rewardPerToken = rewardPerToken; // gas savings
        checkpoints[sender] = Checkpoint({
            reward: _balanceOf(sender, _rewardPerToken).sub(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        checkpoints[recipient] = Checkpoint({
            reward: _balanceOf(recipient, _rewardPerToken).add(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) public override returns (bool accRewardsDisabled) {
        accRewardsDisabled = rewardsDisabled[account];
        if (!accRewardsDisabled) _updateRewardCheckpoint(account, rewardPerToken);
    }

    function _updateRewardCheckpoint(address account, uint128 newRewardPerToken) internal {
        Checkpoint memory cp = checkpoints[account];
        if (newRewardPerToken == cp.rewardPerToken) return;

        uint256 stakedEthAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedEthAmount = stakedEthToken.distributorPrincipal();
        } else {
            stakedEthAmount = stakedEthToken.balanceOf(account);
        }
        if (stakedEthAmount == 0) {
            checkpoints[account] = Checkpoint({
                reward: cp.reward,
                rewardPerToken: newRewardPerToken
            });
        } else {
            uint256 periodRewardPerToken = uint256(newRewardPerToken).sub(cp.rewardPerToken);
            checkpoints[account] = Checkpoint({
                reward: _calculateNewReward(cp.reward, stakedEthAmount, periodRewardPerToken).toUint128(),
                rewardPerToken: newRewardPerToken
            });
        }
    }

    function _calculateNewReward(
        uint256 currentReward,
        uint256 stakedEthAmount,
        uint256 periodRewardPerToken
    )
        internal pure returns (uint256)
    {
        return currentReward.add(stakedEthAmount.mul(periodRewardPerToken).div(1e18));
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoints}.
     */
    function updateRewardCheckpoints(address account1, address account2) public override returns (bool rewardsDisabled1, bool rewardsDisabled2) {
        rewardsDisabled1 = rewardsDisabled[account1];
        rewardsDisabled2 = rewardsDisabled[account2];
        if (!rewardsDisabled1 || !rewardsDisabled2) {
            uint128 newRewardPerToken = rewardPerToken;
            if (!rewardsDisabled1) _updateRewardCheckpoint(account1, newRewardPerToken);
            if (!rewardsDisabled2) _updateRewardCheckpoint(account2, newRewardPerToken);
        }
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(uint256 newTotalRewards) external override {
        require(msg.sender == oracles, "RewardEthToken: access denied");

        uint256 periodRewards = newTotalRewards.sub(totalRewards);
        if (periodRewards == 0) return;

        // calculate reward per token used for account reward calculation
        uint256 maintainerReward = periodRewards.mul(maintainerFee).div(10000);
        uint256 prevRewardPerToken = rewardPerToken;
        uint256 newRewardPerToken = prevRewardPerToken.add(periodRewards.sub(maintainerReward).mul(1e18).div(stakedEthToken.totalDeposits()));
        uint128 newRewardPerToken128 = newRewardPerToken.toUint128();

        // update total rewards and new reward per token
        (totalRewards, rewardPerToken) = (newTotalRewards.toUint128(), newRewardPerToken128);

        // update distributor's checkpoint
        checkpoints[address(0)] = Checkpoint({
            reward: _balanceOf(address(0), newRewardPerToken).toUint128(),
            rewardPerToken: newRewardPerToken128
        });

        // update maintainer's checkpoint and add its period reward
        checkpoints[maintainer] = Checkpoint({
            reward: _balanceOf(maintainer, newRewardPerToken).add(maintainerReward).toUint128(),
            rewardPerToken: newRewardPerToken128
        });

        lastUpdateBlockNumber = block.number;
        emit RewardsUpdated(periodRewards, newTotalRewards, newRewardPerToken);
    }

    /**
     * @dev See {IRewardEthToken-claim}.
     */
    function claim(address account, uint256 amount) external override {
        require(msg.sender == merkleDistributor, "RewardEthToken: access denied");

        // update checkpoints, transfer amount from distributor to account
        uint128 _rewardPerToken = rewardPerToken;
        checkpoints[address(0)] = Checkpoint({
            reward: _balanceOf(address(0), _rewardPerToken).sub(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        checkpoints[account] = Checkpoint({
            reward: _balanceOf(account, _rewardPerToken).add(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        emit Transfer(address(0), account, amount);
    }
}
