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

    // @dev Maps beneficiary address to its rewards' claimer.
    mapping(address => address) public override claimers;

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
    function addAccount(address claimer, address beneficiary, uint128 revenueShare) external override onlyAdmin whenNotPaused {
        require(checkpoints[beneficiary].revenueShare == 0, "RevenueSharing: account already added");
        require(revenueShare > 0 && revenueShare <= 1e4, "RevenueSharing: invalid revenue share");
        require(claimer != address(0) && beneficiary != address(0), "RevenueSharing: invalid claimer or beneficiary");

        // register new checkpoint
        checkpoints[beneficiary] = Checkpoint({
        amount : 0,
        revenueShare : revenueShare,
        unclaimedReward : 0,
        rewardPerPoint : rewardPerPoint
        });

        // register account that can claim rewards
        claimers[beneficiary] = claimer;
        emit AccountAdded(beneficiary, claimer, revenueShare);
    }

    /**
     * @dev See {IRevenueSharing-removeAccount}.
     */
    function removeAccount(address beneficiary) external override onlyAdmin whenNotPaused {
        Checkpoint memory checkpoint = checkpoints[beneficiary];
        require(checkpoint.revenueShare != 0, "RevenueSharing: account is not added");

        // calculate unclaimed reward
        uint256 accountPoints = uint256(checkpoint.amount).mul(checkpoint.revenueShare);
        uint256 reward = _calculateReward(
            accountPoints,
            checkpoint.unclaimedReward,
            rewardPerPoint,
            checkpoint.rewardPerPoint
        );

        // clean up account
        delete checkpoints[beneficiary];
        delete claimers[beneficiary];
        totalPoints = uint256(totalPoints).sub(accountPoints).toUint128();

        if (reward > 0) {
            rewardEthToken.safeTransfer(beneficiary, reward);
        }
        emit AccountRemoved(beneficiary, reward);
    }

    /**
     * @dev See {IRevenueSharing-updateRevenueShare}.
     */
    function updateRevenueShare(address beneficiary, uint128 revenueShare) external override onlyAdmin whenNotPaused {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        require(checkpoint.revenueShare != 0, "RevenueSharing: account is not added");
        require(revenueShare > 0 && revenueShare <= 1e4 && checkpoint.revenueShare != revenueShare, "RevenueSharing: invalid revenue share");

        // SLOAD for gas optimization
        uint128 _rewardPerPoint = rewardPerPoint;

        // calculate unclaimed reward
        uint256 prevPoints = uint256(checkpoint.amount).mul(checkpoint.revenueShare);
        uint256 reward = _calculateReward(
            prevPoints,
            checkpoint.unclaimedReward,
            rewardPerPoint,
            checkpoint.rewardPerPoint
        );

        // update total points and checkpoint
        totalPoints = uint256(totalPoints).sub(prevPoints).add(uint256(checkpoint.amount).mul(revenueShare)).toUint128();
        (checkpoint.revenueShare, checkpoint.rewardPerPoint, checkpoint.unclaimedReward) = (revenueShare, _rewardPerPoint, reward.toUint128());
        emit RevenueShareUpdated(beneficiary, revenueShare, reward);
    }

    /**
     * @dev See {IRevenueSharing-increaseAmount}.
     */
    function increaseAmount(address beneficiary, uint256 amount) external override whenNotPaused {
        require(msg.sender == pool || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "RevenueSharing: access denied");
        require(amount > 0, "RevenueSharing: invalid amount");

        Checkpoint storage checkpoint = checkpoints[beneficiary];
        require(checkpoint.revenueShare != 0, "RevenueSharing: account is not added");

        // SLOAD for gas optimization
        uint128 _rewardPerPoint = rewardPerPoint;

        // calculate unclaimed reward
        uint256 prevPoints = uint256(checkpoint.amount).mul(checkpoint.revenueShare);
        uint256 reward = _calculateReward(
            prevPoints,
            checkpoint.unclaimedReward,
            rewardPerPoint,
            checkpoint.rewardPerPoint
        );

        // update total points and checkpoint
        uint256 newAmount = amount.add(checkpoint.amount);
        totalPoints = uint256(totalPoints).sub(prevPoints).add(newAmount.mul(checkpoint.revenueShare)).toUint128();
        (checkpoint.amount, checkpoint.rewardPerPoint, checkpoint.unclaimedReward) = (newAmount.toUint128(), _rewardPerPoint, reward.toUint128());
        emit AmountIncreased(beneficiary, amount, reward);
    }

    /**
     * @dev See {IRevenueSharing-updateClaimer}.
     */
    function updateClaimer(address newClaimer) external override whenNotPaused {
        address prevClaimer = claimers[msg.sender];
        require(prevClaimer != address(0), "RevenueSharing: account is not added");
        require(newClaimer != address(0) && prevClaimer != newClaimer, "RevenueSharing: invalid new claimer");

        claimers[msg.sender] = newClaimer;
        emit ClaimerUpdated(msg.sender, newClaimer);
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
            rewardPerPoint,
            checkpoint.rewardPerPoint
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
    function collectRewards(address[] calldata beneficiaries) external override whenNotPaused {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            _collectReward(beneficiaries[i]);
        }
    }

    function _collectReward(address beneficiary) internal {
        Checkpoint storage checkpoint = checkpoints[beneficiary];
        require(checkpoint.revenueShare != 0, "RevenueSharing: account is not added");
        require(beneficiary == msg.sender || claimers[beneficiary] == msg.sender, "RevenueSharing: access denied");

        // SLOAD for gas optimization
        uint128 _rewardPerPoint = rewardPerPoint;

        // calculate unclaimed reward
        uint256 accountPoints = uint256(checkpoint.amount).mul(checkpoint.revenueShare);
        uint256 reward = _calculateReward(
            accountPoints,
            checkpoint.unclaimedReward,
            rewardPerPoint,
            checkpoint.rewardPerPoint
        );

        (checkpoint.rewardPerPoint, checkpoint.unclaimedReward) = (_rewardPerPoint, 0);

        if (reward > 0) {
            rewardEthToken.safeTransfer(beneficiary, reward);
        }

        emit RewardCollected(msg.sender, beneficiary, reward);
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
        uint256 unclaimedReward,
        uint256 newRewardPerPoint,
        uint256 prevRewardPerPoint
    )
        internal pure returns (uint256 reward)
    {
        if (newRewardPerPoint > prevRewardPerPoint) {
            reward = points.mul(newRewardPerPoint.sub(prevRewardPerPoint)).div(1e31);
        }

        if (unclaimedReward > 0) {
            reward = reward.add(unclaimedReward);
        }
    }
}
