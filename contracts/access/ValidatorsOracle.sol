// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "../libraries/Roles.sol";
import "../interfaces/IAdmins.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/ISWRToken.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IValidatorsOracle.sol";

/**
 * @title ValidatorsOracle
 *
 * @dev Validators Oracle contract submits validator total rewards to SWRToken contract.
 * Rewards are updated only when a threshold of inputs from different voters received.
 */
contract ValidatorsOracle is IValidatorsOracle, Initializable {
    using SafeMath for uint256;
    using Roles for Roles.Role;

    // @dev Stores voters and defines functions for adding/removing them.
    Roles.Role private voters;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Maps total rewards to the number of votes it has.
    mapping(int256 => uint256) private candidates;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the SWRToken contract.
    ISWRToken private swrToken;

    // @dev Threshold of votes required to update SWRToken rewards.
    uint256 private votesThreshold;

    // @dev Total number of voters.
    uint256 private totalVoters;

    /**
    * @dev Modifier for checking whether the caller is a voter.
    */
    modifier onlyVoter() {
        require(isVoter(msg.sender), "ValidatorsOracle: permission denied");
        _;
    }

    /**
     * @dev See {IValidators-initialize}.
     */
    function initialize(address _admins, address _settings, address _swrToken) public override initializer {
        admins = IAdmins(_admins);
        settings = ISettings(_settings);
        swrToken = ISWRToken(_swrToken);

        // require 66% of voters to agree to submit new total rewards
        votesThreshold = 666666666666666666;
    }

    /**
     * @dev See {IValidatorsOracle-isVoter}.
     */
    function isVoter(address _account) public override view returns (bool) {
        return voters.has(_account);
    }

    /**
     * @dev See {IValidatorsOracle-addVoter}.
     */
    function addVoter(address _account) external override {
        require(admins.isAdmin(msg.sender), "ValidatorsOracle: only admin users can assign voters");
        voters.add(_account);
        totalVoters = totalVoters.add(1);
        emit VoterAdded(_account);
    }

    /**
     * @dev See {IValidatorsOracle-removeVoter}.
     */
    function removeVoter(address _account) external override {
        require(admins.isAdmin(msg.sender), "ValidatorsOracle: only admin users can remove voters");
        voters.remove(_account);
        totalVoters = totalVoters.sub(1);
        emit VoterRemoved(_account);
    }

    /**
     * @dev See {IValidatorsOracle-voteForTotalRewards}.
     */
    function voteForTotalRewards(int256 _newTotalRewards) external override onlyVoter {
        require(!settings.pausedContracts(address(this)), "ValidatorsOracle: contract is paused");

        uint256 updateTimestamp = swrToken.updateTimestamp();
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, updateTimestamp, _newTotalRewards));
        require(!submittedVotes[voteId], "ValidatorsOracle: vote was already submitted");

        // mark vote as submitted, update total rewards votes number
        submittedVotes[voteId] = true;
        candidates[_newTotalRewards] = candidates[_newTotalRewards].add(1);
        emit VoteSubmitted(msg.sender, _newTotalRewards, updateTimestamp);

        // update SWR Token rewards only if enough votes accumulated
        if (candidates[_newTotalRewards].mul(1 ether).div(totalVoters) >= votesThreshold) {
            delete candidates[_newTotalRewards];
            swrToken.updateTotalRewards(_newTotalRewards);
        }
    }
}
