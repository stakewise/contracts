// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardEthToken.sol";
import "./interfaces/IOracles.sol";

/**
 * @title Oracles
 *
 * @dev Oracles contract stores accounts responsible for submitting off-chain data.
 * The threshold of inputs from different oracles is required to submit the data.
 */
contract Oracles is IOracles, ReentrancyGuardUpgradeable, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // @dev Defines the period for total rewards update.
    uint256 public override totalRewardsUpdatePeriod;

    // @dev Maps candidate ID to the number of votes it has.
    mapping(bytes32 => uint256) public override candidates;

    // @dev List of supported rETH2 Uniswap pairs.
    address[] private rewardEthUniswapPairs;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Nonce for RewardEthToken total rewards.
    CountersUpgradeable.Counter private totalRewardsNonce;

    /**
    * @dev Modifier for checking whether the caller is an oracle.
    */
    modifier onlyOracle() {
        require(hasRole(ORACLE_ROLE, msg.sender), "Oracles: access denied");
        _;
    }

    /**
     * @dev See {IOracles-initialize}.
     */
    function initialize(address _admin, address _rewardEthToken, uint256 _totalRewardsUpdatePeriod) external override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ReentrancyGuard_init_unchained();
        rewardEthToken = IRewardEthToken(_rewardEthToken);

        totalRewardsUpdatePeriod = _totalRewardsUpdatePeriod;
        emit TotalRewardsUpdatePeriodUpdated(_totalRewardsUpdatePeriod);
    }

    /**
     * @dev See {IOracles-getRewardEthUniswapPairs}.
     */
    function getRewardEthUniswapPairs() public override view returns (address[] memory) {
        return rewardEthUniswapPairs;
    }

    /**
     * @dev See {IOracles-hasTotalRewardsVote}.
     */
    function hasTotalRewardsVote(address _oracle, uint256 _totalRewards) external override view returns (bool) {
        bytes32 candidateId = keccak256(abi.encodePacked(address(rewardEthToken), totalRewardsNonce.current(), _totalRewards));
        return submittedVotes[keccak256(abi.encodePacked(_oracle, candidateId))];
    }

    /**
     * @dev See {IOracles-isOracle}.
     */
    function isOracle(address _account) external override view returns (bool) {
        return hasRole(ORACLE_ROLE, _account);
    }

    /**
     * @dev See {IOracles-addOracle}.
     */
    function addOracle(address _account) external override {
        grantRole(ORACLE_ROLE, _account);
    }

    /**
     * @dev See {IOracles-removeOracle}.
     */
    function removeOracle(address _account) external override {
        revokeRole(ORACLE_ROLE, _account);
    }

    /**
     * @dev See {IOracles-setRewardEthUniswapPairs}.
     */
    function setRewardEthUniswapPairs(address[] calldata _rewardEthUniswapPairs) external override onlyAdmin {
        rewardEthUniswapPairs = _rewardEthUniswapPairs;
        emit RewardEthUniswapPairsUpdated(_rewardEthUniswapPairs);
    }

    /**
     * @dev See {IOracles-setTotalRewardsUpdatePeriod}.
     */
    function setTotalRewardsUpdatePeriod(uint256 _newTotalRewardsUpdatePeriod) external override onlyAdmin {
        totalRewardsUpdatePeriod = _newTotalRewardsUpdatePeriod;
        emit TotalRewardsUpdatePeriodUpdated(_newTotalRewardsUpdatePeriod);
    }

    /**
     * @dev See {IOracles-voteForTotalRewards}.
     */
    function voteForTotalRewards(uint256 _newTotalRewards) external override onlyOracle whenNotPaused nonReentrant {
        uint256 nonce = totalRewardsNonce.current();
        bytes32 candidateId = keccak256(abi.encodePacked(address(rewardEthToken), nonce, _newTotalRewards));
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, candidateId));
        require(!submittedVotes[voteId], "Oracles: already voted");

        // mark vote as submitted, update candidate votes number
        submittedVotes[voteId] = true;
        uint256 candidateNewVotes = candidates[candidateId].add(1);
        candidates[candidateId] = candidateNewVotes;
        emit TotalRewardsVoteSubmitted(msg.sender, nonce, _newTotalRewards);

        // update rewards only if enough votes accumulated
        if (candidateNewVotes.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2)) {
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
