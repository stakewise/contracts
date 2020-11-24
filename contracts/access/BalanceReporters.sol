// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
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

    // @dev Maps candidate ID to the number of votes it has.
    mapping(bytes32 => uint256) public override candidates;

    // @dev Total number of reporters.
    uint256 public override totalReporters;

    // @dev List of supported uniswap pairs for syncing.
    address[] private uniswapPairs;

    // @dev Stores reporters and defines functions for adding/removing them.
    Roles.Role private reporters;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Threshold of votes required to update RewardEthToken rewards.
    uint256 private votesThreshold;

    // @dev Indicates whether the calling function is locked.
    uint256 private unlocked;

    modifier lock() {
        require(unlocked == 1, "BalanceReporters: locked");
        unlocked = 0;
        _;
        unlocked = 1;
    }

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
        unlocked = 1;

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
     * @dev See {IBalanceReporters-getUniswapPairs}.
     */
    function getUniswapPairs() public override view returns (address[] memory) {
        return uniswapPairs;
    }

    /**
     * @dev See {IBalanceReporters-hasVoted}.
     */
    function hasVoted(address _reporter, int256 _newTotalRewards, bool _syncUniswapPairs) public override view returns (bool) {
        bytes32 candidateId = keccak256(abi.encodePacked(rewardEthToken.updateTimestamp(), _newTotalRewards, _syncUniswapPairs));
        return submittedVotes[keccak256(abi.encodePacked(_reporter, candidateId))];
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
     * @dev See {IBalanceReporters-setUniswapPairs}.
     */
    function setUniswapPairs(address[] calldata _uniswapPairs) external override {
        require(admins.isAdmin(msg.sender), "BalanceReporters: only admin users can set uniswap pairs");
        uniswapPairs = _uniswapPairs;
        emit UniswapPairsUpdated(_uniswapPairs);
    }

    /**
     * @dev See {IBalanceReporters-voteForTotalRewards}.
     */
    function voteForTotalRewards(int256 _newTotalRewards, bool _syncUniswapPairs) external override onlyReporter lock {
        require(!settings.pausedContracts(address(this)), "BalanceReporters: contract is paused");

        uint256 updateTimestamp = rewardEthToken.updateTimestamp();
        bytes32 candidateId = keccak256(abi.encodePacked(updateTimestamp, _newTotalRewards, _syncUniswapPairs));
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, candidateId));
        require(!submittedVotes[voteId], "BalanceReporters: vote was already submitted");

        // mark vote as submitted, update total rewards votes number
        submittedVotes[voteId] = true;
        candidates[candidateId] = candidates[candidateId].add(1);
        emit VoteSubmitted(msg.sender, _newTotalRewards, _syncUniswapPairs, updateTimestamp);

        // update rewards only if enough votes accumulated
        if (candidates[candidateId].mul(1e18).div(totalReporters) >= votesThreshold) {
            delete candidates[candidateId];
            rewardEthToken.updateTotalRewards(_newTotalRewards);

            if (_syncUniswapPairs) {
                // force reserves to match balances
                for (uint256 i = 0; i < uniswapPairs.length; i++) {
                    IUniswapV2Pair(uniswapPairs[i]).sync();
                }
            }
        }
    }
}
