// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardEthToken.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IOracles.sol";
import "./interfaces/IMerkleDistributor.sol";

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

    // @dev Defines how often oracles submit data (in blocks).
    uint256 public override syncPeriod;

    // @dev Maps candidate ID to the number of votes it has.
    mapping(bytes32 => uint256) public override candidates;

    // @dev [Deprecated] List of supported rETH2 Uniswap pairs.
    address[] private rewardEthUniswapPairs;

    // @dev Maps vote ID to whether it was submitted or not.
    mapping(bytes32 => bool) private submittedVotes;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Nonce is used to protect from submitting the same vote several times.
    CountersUpgradeable.Counter private nonce;

    // @dev Address of the Pool contract.
    IPool private pool;

    // @dev Address of the MerkleDistributor contract.
    IMerkleDistributor private merkleDistributor;

    /**
    * @dev Modifier for checking whether the caller is an oracle.
    */
    modifier onlyOracle() {
        require(hasRole(ORACLE_ROLE, msg.sender), "Oracles: access denied");
        _;
    }

    /**
     * @dev See {IOracles-upgrade}.
     */
    function upgrade(address _merkleDistributor, uint256 _syncPeriod) external override onlyAdmin whenPaused {
        require(address(merkleDistributor) == address(0), "Oracles: already upgraded");
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
        syncPeriod = _syncPeriod;
    }

    /**
     * @dev See {IOracles-hasVote}.
     */
    function hasVote(address oracle, bytes32 candidateId) external override view returns (bool) {
        return submittedVotes[keccak256(abi.encode(oracle, candidateId))];
    }

    /**
     * @dev See {IOracles-currentNonce}.
     */
    function currentNonce() external override view returns (uint256) {
        return nonce.current();
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
     * @dev See {IOracles-setSyncPeriod}.
     */
    function setSyncPeriod(uint256 _syncPeriod) external override onlyAdmin {
        require(!isRewardsVoting(), "Oracles: cannot update during voting");
        syncPeriod = _syncPeriod;
        emit SyncPeriodUpdated(_syncPeriod, msg.sender);
    }

    /**
     * @dev See {IOracles-isRewardsVoting}.
     */
    function isRewardsVoting() public override view returns (bool) {
        return rewardEthToken.lastUpdateBlockNumber().add(syncPeriod) < block.number;
    }

    /**
     * @dev See {IOracles-isMerkleRootVoting}.
     */
    function isMerkleRootVoting() public override view returns (bool) {
        uint256 lastRewardBlockNumber = rewardEthToken.lastUpdateBlockNumber();
        return merkleDistributor.lastUpdateBlockNumber() < lastRewardBlockNumber && lastRewardBlockNumber < block.number;
    }

    /**
     * @dev See {IOracles-voteForRewards}.
     */
    function voteForRewards(uint256 totalRewards, uint256 activatedValidators) external override onlyOracle whenNotPaused {
        uint256 _nonce = nonce.current();
        bytes32 candidateId = keccak256(abi.encode(_nonce, totalRewards, activatedValidators));
        bytes32 voteId = keccak256(abi.encode(msg.sender, candidateId));
        require(!submittedVotes[voteId], "Oracles: already voted");
        require(isRewardsVoting(), "Oracles: too early vote");

        // mark vote as submitted, update candidate votes number
        submittedVotes[voteId] = true;
        uint256 candidateNewVotes = candidates[candidateId].add(1);
        candidates[candidateId] = candidateNewVotes;
        emit RewardsVoteSubmitted(msg.sender, _nonce, totalRewards, activatedValidators);

        // update only if enough votes accumulated
        uint256 oraclesCount = getRoleMemberCount(ORACLE_ROLE);
        if (candidateNewVotes.mul(3) > oraclesCount.mul(2)) {
            // update total rewards
            rewardEthToken.updateTotalRewards(totalRewards);

            // update activated validators
            if (activatedValidators != pool.activatedValidators()) {
                pool.setActivatedValidators(activatedValidators);
            }

            // clean up votes
            delete submittedVotes[voteId];
            for (uint256 i = 0; i < oraclesCount; i++) {
                address oracle = getRoleMember(ORACLE_ROLE, i);
                if (oracle == msg.sender) continue;
                delete submittedVotes[keccak256(abi.encode(oracle, candidateId))];
            }

            // clean up candidate
            nonce.increment();
            delete candidates[candidateId];
        }
    }

    /**
     * @dev See {IOracles-voteForMerkleRoot}.
     */
    function voteForMerkleRoot(bytes32 merkleRoot, string calldata merkleProofs) external override onlyOracle whenNotPaused {
        uint256 _nonce = nonce.current();
        bytes32 candidateId = keccak256(abi.encode(_nonce, merkleRoot, merkleProofs));
        bytes32 voteId = keccak256(abi.encode(msg.sender, candidateId));
        require(!submittedVotes[voteId], "Oracles: already voted");
        require(isMerkleRootVoting(), "Oracles: too early vote");

        // mark vote as submitted, update candidate votes number
        submittedVotes[voteId] = true;
        uint256 candidateNewVotes = candidates[candidateId].add(1);
        candidates[candidateId] = candidateNewVotes;
        emit MerkleRootVoteSubmitted(msg.sender, _nonce, merkleRoot, merkleProofs);

        // update only if enough votes accumulated
        uint256 oraclesCount = getRoleMemberCount(ORACLE_ROLE);
        if (candidateNewVotes.mul(3) > oraclesCount.mul(2)) {
            // update merkle root
            merkleDistributor.setMerkleRoot(merkleRoot, merkleProofs);

            // clean up votes
            delete submittedVotes[voteId];
            for (uint256 i = 0; i < oraclesCount; i++) {
                address oracle = getRoleMember(ORACLE_ROLE, i);
                if (oracle == msg.sender) continue;
                delete submittedVotes[keccak256(abi.encode(oracle, candidateId))];
            }

            // clean up candidate
            nonce.increment();
            delete candidates[candidateId];
        }
    }
}
