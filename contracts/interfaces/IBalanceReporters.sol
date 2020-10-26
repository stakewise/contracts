// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

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
    * @param updateTimestamp - timestamp of the RewardEthToken last update.
    */
    event VoteSubmitted(address indexed reporter, int256 newTotalRewards, uint256 updateTimestamp);

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
    */
    function hasVoted(address _reporter, int256 _newTotalRewards) external view returns (bool);

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
    * @dev Function for voting for new RewardEthToken total rewards.
    * Can only be called by an account with a reporter role.
    * @param _newTotalRewards - total rewards to give a vote for.
    */
    function voteForTotalRewards(int256 _newTotalRewards) external;
}
