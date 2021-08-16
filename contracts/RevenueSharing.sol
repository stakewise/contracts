// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRevenueSharing.sol";


/**
 * @title RevenueSharing
 *
 * @dev RevenueSharing contract cuts the Pool's reward and distributes among added accounts.
 */
contract RevenueSharing is IRevenueSharing, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // @dev Maps beneficiary address to the reward checkpoint.
    mapping(address => Checkpoint) public override checkpoints;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the RewardEthToken contract.
    IERC20Upgradeable private rewardEthToken;

    // @dev Total number of points (sum of contributed amount * revenue share %).
    uint128 public override totalPoints;

    // @dev Current rETH2 reward amount per point.
    uint128 public override rewardPerPoint;

    /**
     * @dev See {IRevenueSharing-initialize}.
     */
    function initialize(address _admin, address _pool, address _rewardEthToken) external override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        pool = _pool;
        rewardEthToken = IERC20Upgradeable(_rewardEthToken);
    }

    /**
     * @dev See {IRevenueSharing-isAdded}.
     */
    function isAdded(address beneficiary) external view override returns (bool) {
        return checkpoints[beneficiary].revenueShare != 0;
    }

    /**
     * @dev See {IRevenueSharing-addAccount}.
     */
    function addAccount(address beneficiary, uint128 revenueShare) external override onlyAdmin whenNotPaused {
        require(checkpoints[beneficiary].revenueShare == 0, "RevenueSharing: account already added");
        require(revenueShare > 0 && revenueShare <= 1e4, "RevenueSharing: invalid revenue share");
        require(beneficiary != address(0), "RevenueSharing: invalid beneficiary");

        // register new checkpoint
        checkpoints[beneficiary] = Checkpoint({
            amount: 0,
            revenueShare: revenueShare,
            unclaimedReward: 0,
            rewardPerPoint: rewardPerPoint
        });
        emit AccountAdded(beneficiary, revenueShare);
    }

    /**
     * @dev See {IRevenueSharing-removeAccount}.
     */
    function removeAccount(address beneficiary) external override onlyAdmin whenNotPaused {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        (
            uint256 amount,
            uint256 revenueShare,
            uint256 prevReward,
            uint256 prevRewardPerPoint
        ) = (
            checkpoint.amount,
            checkpoint.revenueShare,
            checkpoint.unclaimedReward,
            checkpoint.rewardPerPoint
        );
        require(revenueShare != 0, "RevenueSharing: account is not added");

        // calculate new reward
        uint256 accountPoints = amount.mul(revenueShare);
        uint256 newReward = _calculateReward(accountPoints, prevReward, prevRewardPerPoint, rewardPerPoint);

        // clean up account
        delete checkpoints[beneficiary];
        totalPoints = uint256(totalPoints).sub(accountPoints).toUint128();

        // transfer funds
        if (newReward > 0) {
            rewardEthToken.safeTransfer(beneficiary, newReward);
        }
        emit AccountRemoved(beneficiary, newReward);
    }

    /**
     * @dev See {IRevenueSharing-updateRevenueShare}.
     */
    function updateRevenueShare(address beneficiary, uint256 newRevenueShare) external override onlyAdmin whenNotPaused {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        (
            uint256 amount,
            uint256 prevRevenueShare,
            uint256 prevReward,
            uint256 prevRewardPerPoint
        ) = (
            checkpoint.amount,
            checkpoint.revenueShare,
            checkpoint.unclaimedReward,
            checkpoint.rewardPerPoint
        );
        require(prevRevenueShare != 0, "RevenueSharing: account is not added");
        require(newRevenueShare > 0 && newRevenueShare <= 1e4 && prevRevenueShare != newRevenueShare, "RevenueSharing: invalid revenue share");

        // SLOAD for gas optimization
        uint128 newRewardPerPoint = rewardPerPoint;

        // calculate new reward
        uint256 prevPoints = amount.mul(prevRevenueShare);
        uint256 newReward = _calculateReward(prevPoints, prevReward, prevRewardPerPoint, newRewardPerPoint);

        // update total points and checkpoint
        totalPoints = uint256(totalPoints).sub(prevPoints).add(amount.mul(newRevenueShare)).toUint128();
        (
            checkpoint.revenueShare,
            checkpoint.rewardPerPoint,
            checkpoint.unclaimedReward
        ) = (
            newRevenueShare.toUint128(),
            newRewardPerPoint,
            newReward.toUint128()
        );
        emit RevenueShareUpdated(beneficiary, newRevenueShare, newReward);
    }

    /**
     * @dev See {IRevenueSharing-increaseAmount}.
     */
    function increaseAmount(address beneficiary, uint256 addedAmount) external override whenNotPaused {
        require(msg.sender == pool || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "RevenueSharing: access denied");
        require(addedAmount > 0, "RevenueSharing: invalid amount");

        Checkpoint storage checkpoint = checkpoints[beneficiary];
        (
            uint256 prevAmount,
            uint256 revenueShare,
            uint256 prevReward,
            uint256 prevRewardPerPoint
        ) = (
            checkpoint.amount,
            checkpoint.revenueShare,
            checkpoint.unclaimedReward,
            checkpoint.rewardPerPoint
        );
        require(revenueShare != 0, "RevenueSharing: account is not added");

        // SLOAD for gas optimization
        uint128 newRewardPerPoint = rewardPerPoint;

        // calculate new reward
        uint256 prevPoints = prevAmount.mul(revenueShare);
        uint256 newReward = _calculateReward(prevPoints, prevReward, prevRewardPerPoint, newRewardPerPoint);

        // update total points and checkpoint
        uint256 newAmount = prevAmount.add(addedAmount);
        totalPoints = uint256(totalPoints).sub(prevPoints).add(newAmount.mul(revenueShare)).toUint128();
        (
            checkpoint.amount,
            checkpoint.rewardPerPoint,
            checkpoint.unclaimedReward
        ) = (
            newAmount.toUint128(),
            newRewardPerPoint,
            newReward.toUint128()
        );
        emit AmountIncreased(beneficiary, addedAmount, newReward);
    }

    /**
     * @dev See {IRevenueSharing-pointsOf}.
     */
    function pointsOf(address beneficiary) external view override returns (uint256) {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        if (checkpoint.amount <= 0) {
            return 0;
        }
        return uint256(checkpoint.amount).mul(checkpoint.revenueShare);
    }

    /**
     * @dev See {IRevenueSharing-rewardOf}.
     */
    function rewardOf(address beneficiary) external view override returns (uint256) {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        return _calculateReward(
            uint256(checkpoint.amount).mul(checkpoint.revenueShare),
            checkpoint.unclaimedReward,
            checkpoint.rewardPerPoint,
            rewardPerPoint
        );
    }

    /**
     * @dev See {IRevenueSharing-collectReward}.
     */
    function collectReward(address beneficiary) external override whenNotPaused {
        _collectReward(beneficiary);
    }

    /**
     * @dev See {IRevenueSharing-collectRewards}.
     */
    function collectRewards(address[] memory beneficiaries) external override whenNotPaused {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            _collectReward(beneficiaries[i]);
        }
    }

    function _collectReward(address beneficiary) internal {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        (
            uint256 amount,
            uint256 revenueShare,
            uint256 prevReward,
            uint256 prevRewardPerPoint
        ) = (
            checkpoint.amount,
            checkpoint.revenueShare,
            checkpoint.unclaimedReward,
            checkpoint.rewardPerPoint
        );
        require(revenueShare != 0, "RevenueSharing: account is not added");

        // SLOAD for gas optimization
        uint128 newRewardPerPoint = rewardPerPoint;

        // calculate new reward
        uint256 accountPoints = amount.mul(revenueShare);
        uint256 newReward = _calculateReward(
            accountPoints,
            prevReward,
            prevRewardPerPoint,
            newRewardPerPoint
        );

        (checkpoint.rewardPerPoint, checkpoint.unclaimedReward) = (newRewardPerPoint, 0);

        if (newReward > 0) {
            rewardEthToken.safeTransfer(beneficiary, newReward);
        }

        emit RewardCollected(msg.sender, beneficiary, newReward);
    }

    /**
     * @dev See {IRevenueSharing-updateRewards}.
     */
    function updateRewards(uint256 totalReward, uint256 totalStaked) external override whenNotPaused returns (uint256) {
        require(msg.sender == address(rewardEthToken), "RevenueSharing: access denied");

        if (totalReward == 0 || totalStaked == 0) {
            // nothing to update
            return 0;
        }

        // SLOAD for gas optimization
        (uint256 _totalPoints, uint256 prevRewardPerPoint) = (totalPoints, rewardPerPoint);
        if (_totalPoints == 0) {
            return 0;
        }

        // calculate period reward
        uint256 periodReward = totalReward.mul(_totalPoints).div(totalStaked.mul(1e4));

        // update reward per point
        rewardPerPoint = prevRewardPerPoint.add(periodReward.mul(1e31).div(_totalPoints)).toUint128();

        emit RewardsUpdated(msg.sender, periodReward);
        return periodReward;
    }

    function _calculateReward(
        uint256 points,
        uint256 prevReward,
        uint256 prevRewardPerPoint,
        uint256 newRewardPerPoint
    )
        internal pure returns (uint256 newReward)
    {
        if (newRewardPerPoint > prevRewardPerPoint) {
            newReward = points.mul(newRewardPerPoint.sub(prevRewardPerPoint)).div(1e31);
        }

        if (prevReward > 0) {
            newReward = newReward.add(prevReward);
        }
    }
}
