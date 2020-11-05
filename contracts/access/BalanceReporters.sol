// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../libraries/Roles.sol";
import "../interfaces/IAdmins.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IBalanceReporters.sol";

/**
 * @title BalanceReporters
 *
 * @dev Balance reporters contract stores accounts responsible for submitting pool total rewards to RewardEthToken contract.
 * Rewards are updated only when a threshold of inputs from different reporters received.
 */
contract BalanceReporters is IBalanceReporters, Initializable {
    using SafeMath for uint256;
    using Roles for Roles.Role;

    // @dev Stores reporters and defines functions for adding/removing them.
    Roles.Role private reporters;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Maps total rewards to the number of votes it has.
    mapping(int256 => uint256) private candidates;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Threshold of votes required to update RewardEthToken rewards.
    uint256 private votesThreshold;

    // @dev Total number of reporters.
    uint256 private totalReporters;

    /**
    * @dev Modifier for checking whether the caller is a reporter.
    */
    modifier onlyReporter() {
        require(isReporter(msg.sender), "BalanceReporters: permission denied");
        _;
    }

    /**
     * @dev See {IBalanceReporters-initialize}.
     */
    function initialize(address _admins, address _settings, address _rewardEthToken) public override initializer {
        admins = IAdmins(_admins);
        settings = ISettings(_settings);
        rewardEthToken = IRewardEthToken(_rewardEthToken);

        // require 66% of reporters to agree to submit new total rewards
        votesThreshold = 666666666666666666;
    }

    /**
     * @dev See {IBalanceReporters-isReporter}.
     */
    function isReporter(address _account) public override view returns (bool) {
        return reporters.has(_account);
    }

    /**
     * @dev See {IBalanceReporters-hasVoted}.
     */
    function hasVoted(address _account, int256 _newTotalRewards) public override view returns (bool) {
        bytes32 voteId = keccak256(abi.encodePacked(_account, rewardEthToken.updateTimestamp(), _newTotalRewards));
        return submittedVotes[voteId];
    }

    /**
     * @dev See {IBalanceReporters-addReporter}.
     */
    function addReporter(address _account) external override {
        require(admins.isAdmin(msg.sender), "BalanceReporters: only admin users can assign reporters");
        reporters.add(_account);
        totalReporters = totalReporters.add(1);
        emit ReporterAdded(_account);
    }

    /**
     * @dev See {IBalanceReporters-removeReporter}.
     */
    function removeReporter(address _account) external override {
        require(admins.isAdmin(msg.sender), "BalanceReporters: only admin users can remove reporters");
        reporters.remove(_account);
        totalReporters = totalReporters.sub(1);
        emit ReporterRemoved(_account);
    }

    /**
     * @dev See {IBalanceReporters-voteForTotalRewards}.
     */
    function voteForTotalRewards(int256 _newTotalRewards) external override onlyReporter {
        require(!settings.pausedContracts(address(this)), "BalanceReporters: contract is paused");

        uint256 updateTimestamp = rewardEthToken.updateTimestamp();
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, updateTimestamp, _newTotalRewards));
        require(!submittedVotes[voteId], "BalanceReporters: vote was already submitted");

        // mark vote as submitted, update total rewards votes number
        submittedVotes[voteId] = true;
        candidates[_newTotalRewards] = candidates[_newTotalRewards].add(1);
        emit VoteSubmitted(msg.sender, _newTotalRewards, updateTimestamp);

        // update rewards only if enough votes accumulated
        if (candidates[_newTotalRewards].mul(1 ether).div(totalReporters) >= votesThreshold) {
            delete candidates[_newTotalRewards];
            rewardEthToken.updateTotalRewards(_newTotalRewards);
        }
    }
}
