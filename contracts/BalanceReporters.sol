// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
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
    using CountersUpgradeable for CountersUpgradeable.Counter;

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // @dev Maps candidate ID to the number of votes it has.
    mapping(bytes32 => uint256) public override candidates;

    // @dev List of supported rwETH Uniswap pairs.
    address[] private rewardEthUniswapPairs;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Nonce for RewardEthToken total rewards.
    CountersUpgradeable.Counter private totalRewardsNonce;

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
     * @dev See {IBalanceReporters-getRewardEthUniswapPairs}.
     */
    function getRewardEthUniswapPairs() public override view returns (address[] memory) {
        return rewardEthUniswapPairs;
    }

    /**
     * @dev See {IBalanceReporters-hasTotalRewardsVote}.
     */
    function hasTotalRewardsVote(address _reporter, uint256 _nonce, uint256 _totalRewards) external override view returns (bool) {
        bytes32 candidateId = keccak256(abi.encodePacked(address(rewardEthToken), _nonce, _totalRewards));
        return submittedVotes[keccak256(abi.encodePacked(_reporter, candidateId))];
    }

    /**
     * @dev See {IBalanceReporters-isReporter}.
     */
    function isReporter(address _account) external override view returns (bool) {
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
     * @dev See {IBalanceReporters-setRewardEthUniswapPairs}.
     */
    function setRewardEthUniswapPairs(address[] calldata _rewardEthUniswapPairs) external override onlyAdmin {
        rewardEthUniswapPairs = _rewardEthUniswapPairs;
        emit RewardEthUniswapPairsUpdated(_rewardEthUniswapPairs);
    }

    /**
     * @dev See {IBalanceReporters-voteForTotalRewards}.
     */
    function voteForTotalRewards(uint256 _newTotalRewards) external override onlyReporter whenNotPaused nonReentrant {
        uint256 nonce = totalRewardsNonce.current();
        bytes32 candidateId = keccak256(abi.encodePacked(address(rewardEthToken), nonce, _newTotalRewards));
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, candidateId));
        require(!submittedVotes[voteId], "BalanceReporters: rwETH total rewards vote was already submitted");

        // mark vote as submitted, update candidate votes number
        submittedVotes[voteId] = true;
        candidates[candidateId] = candidates[candidateId].add(1);
        emit TotalRewardsVoteSubmitted(msg.sender, nonce, _newTotalRewards);

        // update rewards only if enough votes accumulated
        if (candidates[candidateId].mul(3) > getRoleMemberCount(REPORTER_ROLE).mul(2)) {
            totalRewardsNonce.increment();
            delete candidates[candidateId];
            rewardEthToken.updateTotalRewards(_newTotalRewards);

            // force reserves to match balances
            for (uint256 i = 0; i < rewardEthUniswapPairs.length; i++) {
                IUniswapV2Pair(rewardEthUniswapPairs[i]).sync();
            }
        }
    }
}
