// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the ValidatorsOracle contract.
 */
interface IValidatorsOracle {
    /**
    * @dev Event for tracking added voter.
    * @param account - address of the account which was assigned a voter role.
    */
    event VoterAdded(address account);

    /**
    * @dev Event for tracking removed voters.
    * @param account - address which was removed voter role.
    */
    event VoterRemoved(address account);

    /**
    * @dev Event for tracking removed voters.
    * @param voter - address of the account which submitted vote.
    * @param newTotalRewards - submitted value of total rewards.
    * @param updateTimestamp - timestamp of the SWR Token last update.
    */
    event VoteSubmitted(address indexed voter, int256 newTotalRewards, uint256 updateTimestamp);

    /**
    * @dev Constructor for initializing the ValidatorsOracle contract.
    * @param _admins - address of the Admins contract.
    * @param _settings - address of the Settings contract.
    * @param _swrToken - address of the SWRToken contract.
    */
    function initialize(address _admins, address _settings, address _swrToken) external;

    /**
    * @dev Function for checking whether an account has a voter role.
    * @param _account - account to check.
    */
    function isVoter(address _account) external view returns (bool);

    /**
    * @dev Function for adding a voter role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign a voter role to.
    */
    function addVoter(address _account) external;

    /**
    * @dev Function for removing a voter role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove a voter role from.
    */
    function removeVoter(address _account) external;

    /**
    * @dev Function for voting for new SWR Token total rewards.
    * Can only be called by an account with a voter role.
    * @param _newTotalRewards - total rewards to give a vote for.
    */
    function voteForTotalRewards(int256 _newTotalRewards) external;
}
