// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the SwiseStaking contract.
 */
interface ISwiseStaking {
    /**
    * @dev Structure for storing a new SWISE staking position. Every user can have only one position.
    * @param amount - amount of SWISE to stake.
    * @param multiplier - multiplier used for increasing user's rewards amount and voting power.
    * @param startTimestamp - timestamp when the lock has started.
    * @param endTimestamp - timestamp when the lock will end.
    * @param claimedEthRewardPerPoint - ethRewardPerPoint since the last claim used for rETH2 rewards calculation.
    * @param claimedSwiseRewardPerPoint - swiseRewardPerPoint since the last claim used for SWISE rewards calculation.
    */
    struct Position {
        uint96 amount;
        uint32 multiplier;
        uint64 startTimestamp;
        uint64 endTimestamp;
        uint128 claimedEthRewardPerPoint;
        uint128 claimedSwiseRewardPerPoint;
    }

    /**
    * @dev Event for tracking new positions.
    * @param owner - address of the position owner.
    * @param multiplier - position multiplier.
    * @param amount - amount deposited.
    */
    event PositionCreated(
        address indexed owner,
        uint32 indexed multiplier,
        uint256 amount
    );

    /**
    * @dev Event for tracking position updates.
    * @param owner - address of the position owner.
    * @param multiplier - new position multiplier.
    * @param newAmount - new position amount.
    */
    event PositionUpdated(
        address indexed owner,
        uint32 indexed multiplier,
        uint256 newAmount
    );

    /**
    * @dev Event for tracking multiplier updates.
    * @param sender - address of the update sender.
    * @param multiplier - the multiplier.
    * @param duration - the multiplier lock duration.
    */
    event MultiplierUpdated(
        address indexed sender,
        uint32 multiplier,
        uint256 duration
    );

    /**
    * @dev Event for tracking position withdrawals.
    * @param owner - address of the position owner.
    * @param ethReward - ETH reward collected.
    * @param swiseReward - SWISE reward collected.
    * @param swisePenalty - SWISE penalty received for the early withdrawal.
    */
    event PositionWithdrawn(
        address indexed owner,
        uint256 ethReward,
        uint256 swiseReward,
        uint256 swisePenalty
    );

    /**
    * @dev Function for getting the total allocated points.
    */
    function totalPoints() external view returns (uint256);

    /**
    * @dev Function for getting the duration of the registered multiplier.
    * @param multiplier - the multiplier to get the duration for.
    */
    function durations(uint32 multiplier) external view returns (uint256);

    /**
    * @dev Function for getting the position of the account.
    * @param account - the address of the account to get the position for.
    */
    function positions(address account)
        external
        view
        returns (
            uint96 amount,
            uint32 multiplier,
            uint64 startTimestamp,
            uint64 endTimestamp,
            uint256 ethReward,
            uint256 swiseReward
        );

    /**
    * @dev Function for getting the current amount of points for the account.
    * @param account - the address of the account to get the points for.
    */
    function balanceOf(address account) external view returns (uint256);

    /**
    * @dev Constructor for initializing the SwiseStaking contract.
    * @param admin - address of the contract admin.
    * @param _swiseToken - address of the StakeWise token.
    * @param _rewardEthToken - address of the RewardEthToken.
    * @param multipliers - array of multipliers to initialize with.
    * @param _durations - array of durations to initialize with.
    */
    function initialize(
        address admin,
        address _swiseToken,
        address _rewardEthToken,
        uint32[] calldata multipliers,
        uint256[] calldata _durations
    ) external;

    /**
    * @dev Function for updating or adding multiplier. Can only be called by account with admin privilege.
    * @param multiplier - the multiplier to update (must be times 100, e.g. 2.5 -> 250).
    * @param duration - the lock duration of the multiplier.
    */
    function setMultiplier(uint32 multiplier, uint256 duration) external;

    /**
    * @dev Function for creating new position.
    * @param amount - amount of SWISE to lock.
    * @param multiplier - the desired rewards and voting multiplier.
    */
    function createPosition(uint96 amount, uint32 multiplier) external;

    /**
    * @dev Function for creating new position with permit.
    * @param amount - amount of SWISE to lock.
    * @param multiplier - the desired rewards and voting multiplier.
    * @param deadline - deadline when the signature expires.
    * @param maxApprove - whether to approve max transfer amount.
    * @param v - secp256k1 signature part.
    * @param r - secp256k1 signature part.
    * @param s - secp256k1 signature part.
    */
    function createPositionWithPermit(
        uint96 amount,
        uint32 multiplier,
        uint256 deadline,
        bool maxApprove,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
    * @dev Function for updating current position with permit call.
    * @param addedAmount - new amount added to the current position.
    * @param proposedMultiplier - new multiplier to use.
    */
    function updatePosition(uint256 addedAmount, uint32 proposedMultiplier, bool compoundSwiseReward) external;

    /**
    * @dev Function for updating current position with permit call.
    * @param addedAmount - new amount added to the current position.
    * @param proposedMultiplier - new multiplier to use.
    * @param deadline - deadline when the signature expires.
    * @param maxApprove - whether to approve max transfer amount.
    * @param v - secp256k1 signature part.
    * @param r - secp256k1 signature part.
    * @param s - secp256k1 signature part.
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
    ) external;

    /**
    * @dev Function for withdrawing position.
    * When withdrawing before lock has expired, the penalty will be applied.
    */
    function withdrawPosition() external;
}
