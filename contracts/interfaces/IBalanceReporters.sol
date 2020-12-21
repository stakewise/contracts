// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the BalanceReporters contract.
 */
interface IBalanceReporters {
    /**
    * @dev Event for tracking votes for RewardEthToken total rewards.
    * @param reporter - address of the account which submitted vote.
    * @param nonce - update nonce.
    * @param totalRewards - submitted value of total rewards.
    */
    event TotalRewardsVoteSubmitted(address indexed reporter, uint256 nonce, uint256 totalRewards);

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
    * @dev Function for retrieving supported reward ETH uniswap pairs.
    */
    function getRewardEthUniswapPairs() external view returns (address[] memory);

    /**
    * @dev Constructor for initializing the BalanceReporters contract.
    * @param _admin - address of the contract admin.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    */
    function initialize(address _admin, address _rewardEthToken) external;

    /**
    * @dev Function for checking whether an account has a reporter role.
    * @param _account - account to check.
    */
    function isReporter(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether an account has voted for the total rewards.
    * @param _reporter - reporter address to check.
    * @param _nonce - vote nonce.
    * @param _totalRewards - total rewards submitted by the reporter.
    */
    function hasTotalRewardsVote(address _reporter, uint256 _nonce, uint256 _totalRewards) external view returns (bool);

    /**
    * @dev Function for adding a reporter role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign a reporter role to.
    */
    function addReporter(address _account) external;

    /**
    * @dev Function for removing a reporter role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove a reporter role from.
    */
    function removeReporter(address _account) external;

    /**
    * @dev Function for updating list of supported reward ETH uniswap pairs.
    * Can only be called by an account with an admin role.
    * @param _rewardEthUniswapPairs - list of supported uniswap pairs.
    */
    function setRewardEthUniswapPairs(address[] calldata _rewardEthUniswapPairs) external;

    /**
    * @dev Function for voting for new RewardEthToken total rewards.
    * Can only be called by an account with a reporter role.
    * @param _newTotalRewards - total rewards to give a vote for.
    */
    function voteForTotalRewards(uint256 _newTotalRewards) external;
}
