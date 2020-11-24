// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the BalanceReporters contract.
 */
interface IBalanceReporters {
    /**
    * @dev Event for tracking added reporter.
    * @param account - address of the account which was assigned a reporter role.
    */
    event ReporterAdded(address account);

    /**
    * @dev Event for tracking removed reporters.
    * @param account - address which was removed reporter role.
    */
    event ReporterRemoved(address account);

    /**
    * @dev Event for tracking removed reporters.
    * @param reporter - address of the account which submitted vote.
    * @param newTotalRewards - submitted value of total rewards.
    * @param syncUniswapPairs - whether to synchronize supported uniswap pairs.
    * @param updateTimestamp - timestamp of the RewardEthToken last update.
    */
    event VoteSubmitted(address indexed reporter, int256 newTotalRewards, bool syncUniswapPairs, uint256 updateTimestamp);

    /**
    * @dev Event for tracking updated uniswap pairs.
    * @param uniswapPairs - new list of supported uniswap pairs.
    */
    event UniswapPairsUpdated(address[] uniswapPairs);

    /**
    * @dev Function for retrieving number of votes for the rewards update candidate.
    * @param _candidateId - ID of the candidate (hash of last update timestamp and total rewards) to retrieve number of votes for.
    */
    function candidates(bytes32 _candidateId) external view returns (uint256);

    /**
    * @dev Function for retrieving supported uniswap pairs.
    */
    function getUniswapPairs() external view returns (address[] memory);

    /**
    * @dev Function for retrieving the total number of reporters.
    */
    function totalReporters() external view returns (uint256);

    /**
    * @dev Constructor for initializing the BalanceReporters contract.
    * @param _admins - address of the Admins contract.
    * @param _settings - address of the Settings contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    */
    function initialize(address _admins, address _settings, address _rewardEthToken) external;

    /**
    * @dev Function for checking whether an account has a reporter role.
    * @param _account - account to check.
    */
    function isReporter(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether an account has a voted for the total rewards in current timestamp.
    * @param _reporter - reporter address to check.
    * @param _newTotalRewards - total rewards submitted by the reporter.
    * @param _syncUniswapPairs - whether to synchronize supported uniswap pairs.
    */
    function hasVoted(address _reporter, int256 _newTotalRewards, bool _syncUniswapPairs) external view returns (bool);

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
    * @dev Function for updating list of supported uniswap pairs.
    * Can only be called by an account with an admin role.
    * @param _uniswapPairs - list of supported uniswap pairs.
    */
    function setUniswapPairs(address[] calldata _uniswapPairs) external;

    /**
    * @dev Function for voting for new RewardEthToken total rewards.
    * Can only be called by an account with a reporter role.
    * @param _newTotalRewards - total rewards to give a vote for.
    * @param _syncUniswapPairs - whether to synchronize supported uniswap pairs.
    */
    function voteForTotalRewards(int256 _newTotalRewards, bool _syncUniswapPairs) external;
}
