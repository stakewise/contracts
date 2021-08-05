// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the RevenueSharing contract.
 */
interface IRevenueSharing {
    /**
    * @dev Structure for storing account's checkpoint.
    * @param amount - total amount contributed.
    * @param revenueShare - revenue share percentage (up to 10000 (100.00%).
    * @param unclaimedReward - total unclaimed reward.
    * @param rewardPerPoint - reward per point at the last checkpoint.
    */
    struct Checkpoint {
        uint128 amount;
        uint128 revenueShare;
        uint128 unclaimedReward;
        uint128 rewardPerPoint;
    }

    /**
    * @dev Event for tracking new accounts.
    * @param beneficiary - address where the reward will be transferred.
    * @param claimer - address that can execute collection of the rewards.
    * @param revenueShare - revenue share percentage.
    */
    event AccountAdded(
        address indexed beneficiary,
        address indexed claimer,
        uint128 indexed revenueShare
    );

    /**
    * @dev Event for tracking removed accounts.
    * @param beneficiary - address where the reward has been transferred.
    * @param reward - transferred unclaimed reward.
    */
    event AccountRemoved(
        address indexed beneficiary,
        uint256 reward
    );

    /**
    * @dev Event for tracking revenue share updates.
    * @param beneficiary - address of the beneficiary.
    * @param revenueShare - new revenue share.
    * @param reward - unclaimed reward.
    */
    event RevenueShareUpdated(
        address indexed beneficiary,
        uint128 indexed revenueShare,
        uint256 reward
    );

    /**
    * @dev Event for tracking increase of the contributed amount.
    * @param beneficiary - address of the beneficiary.
    * @param amount - contributed amount.
    * @param reward - withdrawn reward.
    */
    event AmountIncreased(
        address indexed beneficiary,
        uint256 amount,
        uint256 reward
    );

    /**
    * @dev Event for tracking when rewards are collected.
    * @param sender - address of the transaction sender.
    * @param beneficiary - address of the beneficiary.
    * @param reward - withdrawn reward.
    */
    event RewardCollected(
        address indexed sender,
        address indexed beneficiary,
        uint256 reward
    );

    /**
    * @dev Event for tracking total rewards update.
    * @param sender - address of the transaction sender.
    * @param periodReward - period reward.
    */
    event RewardsUpdated(
        address indexed sender,
        uint256 periodReward
    );

    /**
    * @dev Event for tracking the claimer updates.
    * @param beneficiary - address of the beneficiary.
    * @param claimer - new claimer address.
    */
    event ClaimerUpdated(
        address indexed beneficiary,
        address indexed claimer
    );

    /**
    * @dev Function for getting the total allocated points.
    */
    function totalPoints() external view returns (uint128);

    /**
    * @dev Function for getting the current reward per point.
    */
    function rewardPerPoint() external view returns (uint128);

    /**
    * @dev Constructor for initializing the RevenueSharing contract.
    * @param _admin - address of the contract admin.
    * @param _pool - address of the Pool contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    */
    function initialize(address _admin, address _pool, address _rewardEthToken) external;

    /**
    * @dev Function for retrieving beneficiary's current checkpoint.
    * @param beneficiary - address of the beneficiary account.
    */
    function checkpoints(address beneficiary) external view returns (uint128, uint128, uint128, uint128);

    /**
    * @dev Function for retrieving beneficiary's claimer.
    * @param beneficiary - address of the beneficiary account.
    */
    function claimers(address beneficiary) external view returns (address);

    /**
    * @dev Function for checking whether the beneficiary address is added.
    * @param beneficiary - address of the beneficiary account.
    */
    function isAdded(address beneficiary) external view returns (bool);

    /**
    * @dev Function for updating the claimer.
    * @param newClaimer - the new address of the claimer that can execute collection of rewards.
    */
    function updateClaimer(address newClaimer) external;

    /**
    * @dev Function for adding new account.
    * @param claimer - the address of the claimer that can execute collection of rewards.
    * @param beneficiary - the address of the beneficiary, where the rewards are directed.
    * @param revenueShare - the revenue share that the account will earn (up to 10000 (100.00%)).
    */
    function addAccount(address claimer, address beneficiary, uint128 revenueShare) external;

    /**
    * @dev Function for removing account.
    * @param beneficiary - the address of the beneficiary, where the rewards are directed.
    */
    function removeAccount(address beneficiary) external;

    /**
    * @dev Function for updating account's revenue share.
    * @param beneficiary - the address of the beneficiary to update the revenue share for.
    * @param revenueShare - the new revenue share.
    */
    function updateRevenueShare(address beneficiary, uint128 revenueShare) external;

    /**
    * @dev Function for increasing account's contributed amount.
    * @param beneficiary - the address of the beneficiary to update the amount for.
    * @param amount - the added amount.
    */
    function increaseAmount(address beneficiary, uint256 amount) external;

    /**
    * @dev Function for collecting reward. Can be called by beneficiary or claimer.
    * @param beneficiary - the address of the beneficiary to collect rewards for.
    */
    function collectReward(address beneficiary) external;

    /**
    * @dev Function for collecting rewards. Can be called by beneficiary or claimer.
    * @param beneficiaries - the list of beneficiaries to collect the rewards for. Must have the same claimer.
    */
    function collectRewards(address[] calldata beneficiaries) external;

    /**
    * @dev Function for updating rewards. Can be only be called by the RewardEthToken contract.
    * @param totalReward - the total amount to split the reward from.
    * @param totalStaked - the total amount staked used for reward per point calculation.
    */
    function updateRewards(uint256 totalReward, uint256 totalStaked) external returns (uint256);

    /**
    * @dev Function for checking the points of the beneficiary.
    * @param beneficiary - the address of the beneficiary to check the points for.
    */
    function pointsOf(address beneficiary) external view returns (uint256);

    /**
    * @dev Function for checking the reward of the beneficiary.
    * @param beneficiary - the address of the beneficiary to check the reward for.
    */
    function rewardOf(address beneficiary) external view returns (uint256);
}
