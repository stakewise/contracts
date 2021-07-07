// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/drafts/IERC20PermitUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/ISwiseStaking.sol";

/**
 * @title SwiseStaking
 * @dev SwiseStaking contract distributes the pool's fee to those who have
 * locked their SWISE token for a predefined time. With a longer lock period,
 * a user gets more rETH2 rewards and increases his voting power. If the user decides to take
 * the deposit out before the lock period ends, his deposit will be penalized proportionally to
 * the amount of time that has been left to be locked. The penalty will be distributed among those
 * who still have their SWISE locked proportionally to their amount and lock duration.
 */
contract SwiseStaking is ISwiseStaking, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // @dev Maps multiplier to the duration of the lock.
    mapping(uint32 => uint256) public override durations;

    // @dev Total points (deposited SWISE amount * multiplier).
    uint256 public override totalPoints;

    mapping(address => uint32) private startMultipliers;

    // @dev Maps owner address to its position.
    mapping(address => Position) private _positions;

    // @dev Address of the StakeWiseToken contract.
    IERC20Upgradeable private swiseToken;

    // @dev Address of the RewardEthToken contract.
    IERC20Upgradeable private rewardEthToken;

    // @dev Total amount of synced rETH2 rewards.
    uint128 private totalEthReward;

    // @dev Last synced rETH2 reward amount per point.
    uint128 private ethRewardPerPoint;

    // @dev Last synced SWISE reward amount per point.
    uint128 private swiseRewardPerPoint;

    // @dev Total amount of rETH2 rewards claimed.
    uint128 private totalEthClaimed;

    /**
     * @dev See {ISwiseStaking-initialize}.
     */
    function initialize(
        address admin,
        address _swiseToken,
        address _rewardEthToken,
        uint32[] calldata multipliers,
        uint256[] calldata _durations
    )
        external override initializer
    {
        uint256 multipliersCount = multipliers.length;
        require(multipliersCount == _durations.length, "SwiseStaking: invalid multipliers");

        __OwnablePausableUpgradeable_init(admin);

        swiseToken = IERC20Upgradeable(_swiseToken);
        rewardEthToken = IERC20Upgradeable(_rewardEthToken);

        for (uint256 i = 0; i < multipliersCount; i++) {
            uint32 multiplier = multipliers[i];
            uint256 duration = _durations[i];
            durations[multiplier] = duration;
            emit MultiplierUpdated(msg.sender, multiplier, duration);
        }
    }

    /**
     * @dev See {ISwiseStaking-positions}.
     */
    function positions(address account)
        override
        external
        view
        returns (
            uint96 amount,
            uint32 multiplier,
            uint64 startTimestamp,
            uint64 endTimestamp,
            uint256 ethReward,
            uint256 swiseReward
        )
    {
        Position memory position = _positions[account];

        // SLOAD for gas optimization
        (
            uint256 prevTotalEthReward,
            uint256 prevEthRewardPerPoint,
            uint256 prevTotalPoints
        ) = (
            totalEthReward,
            ethRewardPerPoint,
            totalPoints
        );

        // calculate new total ETH reward
        uint256 newTotalEthReward = uint256(totalEthClaimed).add(rewardEthToken.balanceOf(address(this)));
        uint256 newEthRewardPerPoint;
        if (prevTotalEthReward == newTotalEthReward || prevTotalPoints == 0) {
            // nothing to update as there are no new rewards or no swise locked
            newEthRewardPerPoint = prevEthRewardPerPoint;
        } else {
            // calculate ETH reward since last checkpoint
            uint256 periodEthReward = newTotalEthReward.sub(prevTotalEthReward);
            newEthRewardPerPoint = prevEthRewardPerPoint.add(periodEthReward.mul(1e18).div(prevTotalPoints));
        }

        (ethReward, swiseReward) = _calculateRewards(
            _calculatePositionPoints(position.amount, position.multiplier),
            position.claimedEthRewardPerPoint,
            newEthRewardPerPoint,
            position.claimedSwiseRewardPerPoint,
            swiseRewardPerPoint
        );
        return (
            position.amount,
            position.multiplier,
            position.startTimestamp,
            position.endTimestamp,
            ethReward,
            swiseReward
        );
    }

    /**
     * @dev See {ISwiseStaking-balanceOf}.
     */
    function balanceOf(address account) override external view returns (uint256) {
        Position memory position = _positions[account];
        return _calculatePositionPoints(position.amount, position.multiplier);
    }

    /**
     * @dev See {ISwiseStaking-setMultiplier}.
     */
    function setMultiplier(uint32 multiplier, uint256 duration) external override onlyAdmin {
        durations[multiplier] = duration;
        emit MultiplierUpdated(msg.sender, multiplier, duration);
    }

    /**
     * @dev See {ISwiseStaking-createPositionWithPermit}.
    */
    function createPositionWithPermit(
        uint96 amount,
        uint32 multiplier,
        uint256 deadline,
        bool maxApprove,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external override
    {
        IERC20PermitUpgradeable(address(swiseToken)).permit(msg.sender, address(this), maxApprove ? uint(-1): amount, deadline, v, r, s);
        _createPosition(amount, multiplier);
    }

    /**
     * @dev See {ISwiseStaking-createPosition}.
     */
    function createPosition(uint96 amount, uint32 multiplier) external override {
        _createPosition(amount, multiplier);
    }

    function _createPosition(uint96 amount, uint32 multiplier) internal whenNotPaused {
        require(amount > 0, "SwiseStaking: invalid amount");
        uint256 duration = durations[multiplier];
        require(duration > 0, "SwiseStaking: multiplier not registered");
        require(_positions[msg.sender].amount == 0, "SwiseStaking: position exists");

        // SLOAD for gas optimization
        uint256 prevTotalPoints = totalPoints;

        // update reward ETH token checkpoint
        uint256 newEthRewardPerPoint = updateEthRewardCheckpoint(totalEthClaimed, prevTotalPoints);

        // create new position
        // solhint-disable-next-line not-rely-on-time
        uint256 timestamp = block.timestamp;
        startMultipliers[msg.sender] = multiplier;
        _positions[msg.sender] = Position({
            amount: amount,
            multiplier: multiplier,
            startTimestamp: timestamp.toUint64(),
            endTimestamp: timestamp.add(duration).toUint64(),
            claimedEthRewardPerPoint: newEthRewardPerPoint.toUint128(),
            claimedSwiseRewardPerPoint: swiseRewardPerPoint
        });

        // update total amounts
        uint256 positionAmount = uint256(amount);
        totalPoints = prevTotalPoints.add(_calculatePositionPoints(positionAmount, multiplier));

        // emit event
        emit PositionCreated(msg.sender, multiplier, positionAmount);

        // lock account's tokens
        swiseToken.safeTransferFrom(msg.sender, address(this), positionAmount);
    }

    /**
     * @dev See {ISwiseStaking-updatePositionWithPermit}.
    */
    function updatePositionWithPermit(
        uint256 addedAmount,
        uint32 proposedMultiplier,
        bool compoundSwiseReward,
        uint256 deadline,
        bool maxApprove,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external override
    {
        IERC20PermitUpgradeable(address(swiseToken)).permit(msg.sender, address(this), maxApprove ? uint(-1): addedAmount, deadline, v, r, s);
        _updatePosition(addedAmount, proposedMultiplier, compoundSwiseReward);
    }

    /**
     * @dev See {ISwiseStaking-updatePosition}.
     */
    function updatePosition(uint256 addedAmount, uint32 proposedMultiplier, bool compoundSwiseReward) external override {
        _updatePosition(addedAmount, proposedMultiplier, compoundSwiseReward);
    }

    function _updatePosition(uint256 addedAmount, uint32 proposedMultiplier, bool compoundSwiseReward) internal whenNotPaused {
        Position storage position = _positions[msg.sender];

        // calculate position previous points
        uint256 prevAmount = uint256(position.amount);
        uint256 prevPositionPoints = _calculatePositionPoints(prevAmount, position.multiplier);
        require(prevPositionPoints > 0, "SwiseStaking: position does not exist");

        // SLOAD for gas optimization
        (uint256 prevTotalPoints, uint256 prevTotalEthClaimed) = (totalPoints, totalEthClaimed);

        // update reward ETH token checkpoint
        uint256 newEthRewardPerPoint = updateEthRewardCheckpoint(prevTotalEthClaimed, prevTotalPoints);

        // calculate new multiplier
        uint256 newMultiplier = _updateMultiplier(position, proposedMultiplier);

        // update rewards
        (uint256 ethReward, uint256 swiseReward) = _updateRewards(
            position,
            prevPositionPoints,
            newEthRewardPerPoint
        );

        // update amount
        uint256 newAmount = _updateAmount(position, prevAmount, addedAmount, swiseReward, compoundSwiseReward);

        // update total points
        totalPoints = prevTotalPoints.sub(prevPositionPoints).add(_calculatePositionPoints(newAmount, newMultiplier));

        // transfer ETH tokens
        if (ethReward > 0) {
            totalEthClaimed = prevTotalEthClaimed.add(ethReward).toUint128();
            rewardEthToken.safeTransfer(msg.sender, ethReward);
        }

        // transfer SWISE tokens
        if (addedAmount > 0 || (!compoundSwiseReward && swiseReward > 0)) {
            _processSwisePayment(compoundSwiseReward ? 0 : swiseReward, addedAmount);
        }

        // emit event
        emit PositionUpdated(msg.sender, position.multiplier, newAmount);
    }

    function _updateAmount(
        Position storage position,
        uint256 prevAmount,
        uint256 addedAmount,
        uint256 swiseReward,
        bool compoundSwiseReward
    )
        internal returns (uint256 newAmount)
    {
        newAmount = prevAmount;
        if (addedAmount > 0) newAmount = newAmount.add(addedAmount);
        if (compoundSwiseReward && swiseReward > 0) newAmount = newAmount.add(swiseReward);

        if (newAmount != prevAmount) {
            require(newAmount < 2**96, "SwiseStaking: invalid added amount");
            position.amount = uint96(newAmount);
        }
    }

    function _processSwisePayment(uint256 swiseReward, uint256 addedSwiseAmount) internal {
        // transfer SWISE tokens
        if (addedSwiseAmount > swiseReward) {
            swiseToken.safeTransferFrom(msg.sender, address(this), addedSwiseAmount.sub(swiseReward));
        } else if (addedSwiseAmount < swiseReward) {
            swiseToken.safeTransfer(msg.sender, swiseReward.sub(addedSwiseAmount));
        }
    }

    function _updateRewards(
        Position storage position,
        uint256 prevPositionPoints,
        uint256 newEthRewardPerPoint
    )
        internal returns (uint256 ethReward, uint256 swiseReward)
    {
        (uint256 prevEthRewardPerPoint, uint256 prevSwiseRewardPerPoint) = (
            position.claimedEthRewardPerPoint,
            position.claimedSwiseRewardPerPoint
        );
        uint256 newSwiseRewardPerPoint = swiseRewardPerPoint;
        if (prevEthRewardPerPoint == newEthRewardPerPoint && prevSwiseRewardPerPoint == newSwiseRewardPerPoint) {
            // no new rewards to collect
            return (0, 0);
        }

        // calculate accumulated rewards
        (ethReward, swiseReward) = _calculateRewards(
            prevPositionPoints,
            prevEthRewardPerPoint,
            newEthRewardPerPoint,
            prevSwiseRewardPerPoint,
            newSwiseRewardPerPoint
        );

        // update claimed checkpoints
        if (ethReward > 0 || swiseReward > 0) {
            (position.claimedEthRewardPerPoint, position.claimedSwiseRewardPerPoint) = (
                newEthRewardPerPoint.toUint128(),
                newSwiseRewardPerPoint.toUint128()
            );
        }
    }

    /**
     * @dev See {ISwiseStaking-withdrawPosition}.
     */
    function withdrawPosition() external override whenNotPaused {
        Position storage position = _positions[msg.sender];

        // calculate position current points
        uint256 positionAmount = uint256(position.amount);
        uint256 positionPoints = _calculatePositionPoints(positionAmount, position.multiplier);
        require(positionPoints > 0, "SwiseStaking: position does not exist");

        // SLOAD for gas optimization
        uint256 prevTotalPoints = totalPoints;
        uint256 prevTotalEthClaimed = totalEthClaimed;

        // update reward ETH token checkpoint
        uint256 newEthRewardPerPoint = updateEthRewardCheckpoint(prevTotalEthClaimed, prevTotalPoints);

        // calculate penalty for withdrawing earlier than supposed
        uint256 swisePenalty = _calculatePenalty(
            position.startTimestamp,
            position.endTimestamp,
            // solhint-disable-next-line not-rely-on-time
            block.timestamp,
            positionAmount
        );

        // calculate accumulated rewards
        uint256 prevSwiseRewardPerPoint = swiseRewardPerPoint;
        (uint256 ethReward, uint256 swiseReward) = _calculateRewards(
            positionPoints,
            position.claimedEthRewardPerPoint,
            newEthRewardPerPoint,
            position.claimedSwiseRewardPerPoint,
            prevSwiseRewardPerPoint
        );

        // update SWISE reward token checkpoint
        uint256 newTotalPoints = prevTotalPoints.sub(positionPoints);
        if (swisePenalty > 0 && newTotalPoints > 0) {
            uint256 periodSwiseRewardPerPoint = swisePenalty.mul(1e18).div(newTotalPoints);
            if (periodSwiseRewardPerPoint > 0) {
                swiseRewardPerPoint = prevSwiseRewardPerPoint.add(periodSwiseRewardPerPoint).toUint128();
            } else {
                // skip penalty if it's smaller than the minimal to distribute
                swisePenalty = 0;
            }
        } else if (newTotalPoints == 0) {
            // the last withdrawn position does not receive penalty
            swisePenalty = 0;
        }

        // clean up position
        delete _positions[msg.sender];
        delete startMultipliers[msg.sender];
        totalPoints = newTotalPoints;

        // emit event
        emit PositionWithdrawn(msg.sender, ethReward, swiseReward, swisePenalty);

        // transfer ETH tokens
        if (ethReward > 0) {
            totalEthClaimed = prevTotalEthClaimed.add(ethReward).toUint128();
            rewardEthToken.safeTransfer(msg.sender, ethReward);
        }

        // transfer SWISE tokens
        positionAmount = positionAmount.sub(swisePenalty).add(swiseReward);
        if (positionAmount > 0) {
            swiseToken.safeTransfer(msg.sender, positionAmount);
        }
    }

    function _calculatePositionPoints(uint256 amount, uint256 multiplier) internal pure returns (uint256) {
        if (multiplier == 100) {
            return amount;
        }
        return amount.mul(multiplier).div(100);
    }

    function _calculatePenalty(
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 currentTimestamp,
        uint256 amount
    )
        internal pure returns (uint256 swisePenalty)
    {
        if (currentTimestamp < endTimestamp) {
            // lock time has not passed yet
            uint256 passedDuration = currentTimestamp.sub(startTimestamp);
            uint256 totalDuration = endTimestamp.sub(startTimestamp);
            swisePenalty = amount.sub(amount.mul(passedDuration).div(totalDuration));
        }
    }

    function _updateMultiplier(Position storage position, uint32 proposedMultiplier) internal returns (uint256) {
        // calculate current multiplier
        uint256 startMultiplier = startMultipliers[msg.sender];
        (uint256 startTimestamp, uint256 endTimestamp) = (position.startTimestamp, position.endTimestamp);
        uint256 currMultiplier = _getCurrentMultiplier(startTimestamp, endTimestamp, startMultiplier);

        // calculate new multiplier
        if (proposedMultiplier == 0) {
            // solhint-disable-next-line not-rely-on-time
            require(block.timestamp < endTimestamp, "SwiseStaking: new multiplier must be added");
            // current multiplier should be used
            position.multiplier = currMultiplier.toUint32();
            return currMultiplier;
        } else {
            // new multiplier has been proposed
            uint256 duration = durations[proposedMultiplier];
            // solhint-disable-next-line not-rely-on-time
            uint256 newEndTimestamp = block.timestamp.add(duration);
            require(duration > 0 && newEndTimestamp > endTimestamp, "SwiseStaking: invalid new multiplier");

            startMultipliers[msg.sender] = proposedMultiplier;
            (
                position.multiplier,
                position.startTimestamp,
                position.endTimestamp
            ) = (
                proposedMultiplier,
                // solhint-disable-next-line not-rely-on-time
                block.timestamp.toUint64(),
                newEndTimestamp.toUint64()
            );
            return proposedMultiplier;
        }
    }

    function _getCurrentMultiplier(
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 startMultiplier
    )
        internal view returns (uint256 currMultiplier)
    {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < endTimestamp && startMultiplier > 100) {
            // lock time has not passed yet
            // solhint-disable-next-line not-rely-on-time
            uint256 passedDuration = block.timestamp.sub(startTimestamp);
            uint256 totalDuration = endTimestamp.sub(startTimestamp);
            currMultiplier = startMultiplier.sub(startMultiplier.sub(100).mul(passedDuration).div(totalDuration));
        } else {
            // lock time has passed
            currMultiplier = 100;
        }
    }

    function _calculateRewards(
        uint256 positionPoints,
        uint256 prevEthRewardPerPoint,
        uint256 newEthRewardPerPoint,
        uint256 prevSwiseRewardPerPoint,
        uint256 newSwiseRewardPerPoint
    )
        internal pure returns (uint256 ethReward, uint256 swiseReward)
    {
        if (prevEthRewardPerPoint < newEthRewardPerPoint) {
            ethReward = positionPoints.mul(newEthRewardPerPoint.sub(prevEthRewardPerPoint)).div(1e18);
        }

        if (prevSwiseRewardPerPoint < newSwiseRewardPerPoint) {
            swiseReward = positionPoints.mul(newSwiseRewardPerPoint.sub(prevSwiseRewardPerPoint)).div(1e18);
        }
    }

    function updateEthRewardCheckpoint(uint256 prevTotalEthClaimed, uint256 prevTotalPoints) internal returns (uint256) {
        // SLOAD for gas optimization
        (uint256 prevTotalEthReward, uint256 prevEthRewardPerPoint) = (totalEthReward, ethRewardPerPoint);

        // calculate new total ETH reward
        uint256 newTotalEthReward = prevTotalEthClaimed.add(rewardEthToken.balanceOf(address(this)));
        if (prevTotalEthReward == newTotalEthReward || prevTotalPoints == 0) {
            // nothing to update as there are no new rewards or no swise locked
            return prevEthRewardPerPoint;
        }

        // calculate ETH reward since last checkpoint
        uint256 periodEthReward = newTotalEthReward.sub(prevTotalEthReward);
        uint256 newEthRewardPerPoint = prevEthRewardPerPoint.add(periodEthReward.mul(1e18).div(prevTotalPoints));

        // write storage values
        (totalEthReward, ethRewardPerPoint) = (newTotalEthReward.toUint128(), newEthRewardPerPoint.toUint128());

        return newEthRewardPerPoint;
    }
}
