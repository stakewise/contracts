// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardEthToken.sol";
import "./interfaces/IBalanceReporters.sol";

/**
 * @title BalanceReporters
 *
 * @dev Balance reporters contract stores accounts responsible for submitting pool total rewards to RewardEthToken contract.
 * Rewards are updated only when a threshold of inputs from different reporters received.
 */
contract BalanceReporters is IBalanceReporters, ReentrancyGuardUpgradeable, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // @dev Maps candidate ID to the number of votes it has.
    mapping(bytes32 => uint256) public override candidates;

    // @dev List of supported uniswap pairs for syncing.
    address[] private uniswapPairs;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    /**
    * @dev Modifier for checking whether the caller is a reporter.
    */
    modifier onlyReporter() {
        require(hasRole(REPORTER_ROLE, msg.sender), "BalanceReporters: permission denied");
        _;
    }

    /**
     * @dev See {IBalanceReporters-initialize}.
     */
    function initialize(address _admin, address _rewardEthToken) public override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ReentrancyGuard_init_unchained();
        rewardEthToken = IRewardEthToken(_rewardEthToken);
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
     * @dev See {IBalanceReporters-isReporter}.
     */
    function isReporter(address _account) public override view returns (bool) {
        return hasRole(REPORTER_ROLE, _account);
    }

    /**
     * @dev See {IBalanceReporters-addReporter}.
     */
    function addReporter(address _account) external override {
        grantRole(REPORTER_ROLE, _account);
    }

    /**
     * @dev See {IBalanceReporters-removeReporter}.
     */
    function removeReporter(address _account) external override {
        revokeRole(REPORTER_ROLE, _account);
    }

    /**
     * @dev See {IBalanceReporters-setUniswapPairs}.
     */
    function setUniswapPairs(address[] calldata _uniswapPairs) external override onlyAdmin {
        uniswapPairs = _uniswapPairs;
        emit UniswapPairsUpdated(_uniswapPairs);
    }

    /**
     * @dev See {IBalanceReporters-voteForTotalRewards}.
     */
    function voteForTotalRewards(
        int256 _newTotalRewards,
        bool _syncUniswapPairs
    )
        external override onlyReporter whenNotPaused nonReentrant
    {
        uint256 updateTimestamp = rewardEthToken.updateTimestamp();
        bytes32 candidateId = keccak256(abi.encodePacked(updateTimestamp, _newTotalRewards, _syncUniswapPairs));
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, candidateId));
        require(!submittedVotes[voteId], "BalanceReporters: vote was already submitted");

        // mark vote as submitted, update total rewards votes number
        submittedVotes[voteId] = true;
        candidates[candidateId] = candidates[candidateId].add(1);
        emit VoteSubmitted(msg.sender, _newTotalRewards, _syncUniswapPairs, updateTimestamp);

        // update rewards only if enough votes accumulated
        if (candidates[candidateId].mul(3) > getRoleMemberCount(REPORTER_ROLE).mul(2)) {
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
