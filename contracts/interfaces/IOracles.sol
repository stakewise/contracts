// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the Oracles contract.
 */
interface IOracles {
    /**
    * @dev Event for tracking votes for RewardEthToken total rewards.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - update nonce.
    * @param totalRewards - submitted value of total rewards.
    */
    event TotalRewardsVoteSubmitted(address indexed oracle, uint256 nonce, uint256 totalRewards);

    /**
    * @dev Event for tracking RewardEthToken total rewards update preiod changes.
    * @param totalRewardsUpdatePeriod - new total rewards update period.
    */
    event TotalRewardsUpdatePeriodUpdated(uint256 totalRewardsUpdatePeriod);

    /**
    * @dev Event for tracking updated reward ETH uniswap pairs.
    * @param rewardEthUniswapPairs - new list of supported uniswap pairs.
    */
    event RewardEthUniswapPairsUpdated(address[] rewardEthUniswapPairs);

    /**
    * @dev Function for retrieving number of votes for the rewards update candidate.
    * @param _candidateId - ID of the candidate to retrieve number of votes for.
    */
    function candidates(bytes32 _candidateId) external view returns (uint256);

    /**
    * @dev Function for retrieving total rewards update period.
    */
    function totalRewardsUpdatePeriod() external view returns (uint256);

    /**
    * @dev Function for retrieving supported reward ETH uniswap pairs.
    */
    function getRewardEthUniswapPairs() external view returns (address[] memory);

    /**
    * @dev Constructor for initializing the Oracles contract.
    * @param _admin - address of the contract admin.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _totalRewardsUpdatePeriod - total rewards update period.
    */
    function initialize(address _admin, address _rewardEthToken, uint256 _totalRewardsUpdatePeriod) external;

    /**
    * @dev Function for checking whether an account has an oracle role.
    * @param _account - account to check.
    */
    function isOracle(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether an account has voted for the total rewards.
    * @param _oracle - oracle address to check.
    * @param _totalRewards - total rewards submitted by the oracle.
    */
    function hasTotalRewardsVote(address _oracle, uint256 _totalRewards) external view returns (bool);

    /**
    * @dev Function for adding an oracle role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign an oracle role to.
    */
    function addOracle(address _account) external;

    /**
    * @dev Function for removing an oracle role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove an oracle role from.
    */
    function removeOracle(address _account) external;

    /**
    * @dev Function for updating list of supported reward ETH uniswap pairs.
    * Can only be called by an account with an admin role.
    * @param _rewardEthUniswapPairs - list of supported uniswap pairs.
    */
    function setRewardEthUniswapPairs(address[] calldata _rewardEthUniswapPairs) external;

    /**
    * @dev Function for updating total rewards update period.
    * Can only be called by an account with an admin role.
    * @param _newTotalRewardsUpdatePeriod - new total rewards.
    */
    function setTotalRewardsUpdatePeriod(uint256 _newTotalRewardsUpdatePeriod) external;

    /**
    * @dev Function for voting for new RewardEthToken total rewards.
    * Can only be called by an account with an oracle role.
    * @param _newTotalRewards - total rewards to give a vote for.
    */
    function voteForTotalRewards(uint256 _newTotalRewards) external;
}
