// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardEthToken.sol";
import "./interfaces/IPool.sol";
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

    // @dev Defines how often oracles submit data.
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

    // @dev Defines whether deposits activation is enabled.
    bool public override depositsActivationEnabled;

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
    function initialize(address _pool, bool _depositsActivationEnabled) external override onlyAdmin whenPaused {
        require(address(pool) == address(0), "Oracles: already initialized");
        pool = IPool(_pool);
        depositsActivationEnabled = _depositsActivationEnabled;
        emit DepositsActivationToggled(_depositsActivationEnabled, msg.sender);
    }

    /**
     * @dev See {IOracles-hasVote}.
     */
    function hasVote(
        address _oracle,
        uint256 _totalRewards,
        uint256 _activationDuration,
        uint256 _beaconActivatingAmount
    )
        external override view returns (bool)
    {
        bytes32 candidateId = keccak256(abi.encodePacked(nonce.current(), _totalRewards, _activationDuration, _beaconActivatingAmount));
        return submittedVotes[keccak256(abi.encodePacked(_oracle, candidateId))];
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
        syncPeriod = _syncPeriod;
        emit SyncPeriodUpdated(_syncPeriod, msg.sender);
    }

    /**
     * @dev See {IOracles-toggleDepositsActivation}.
     */
    function toggleDepositsActivation(bool _depositsActivationEnabled) external override onlyAdmin {
        depositsActivationEnabled = _depositsActivationEnabled;
        emit DepositsActivationToggled(_depositsActivationEnabled, msg.sender);
    }

    /**
     * @dev See {IOracles-vote}.
     */
    function vote(
        uint256 _totalRewards,
        uint256 _activationDuration,
        uint256 _beaconActivatingAmount
    )
        external override onlyOracle whenNotPaused nonReentrant
    {
        uint256 _nonce = nonce.current();
        bytes32 candidateId = keccak256(abi.encodePacked(_nonce, _totalRewards, _activationDuration, _beaconActivatingAmount));
        bytes32 voteId = keccak256(abi.encodePacked(msg.sender, candidateId));
        require(!submittedVotes[voteId], "Oracles: already voted");

        // mark vote as submitted, update candidate votes number
        submittedVotes[voteId] = true;
        uint256 candidateNewVotes = candidates[candidateId].add(1);
        candidates[candidateId] = candidateNewVotes;
        emit VoteSubmitted(msg.sender, _nonce, _totalRewards, _activationDuration, _beaconActivatingAmount);

        // update only if enough votes accumulated
        if (candidateNewVotes.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2)) {
            nonce.increment();
            delete candidates[candidateId];

            // update total rewards
            rewardEthToken.updateTotalRewards(_totalRewards);

            if (!depositsActivationEnabled) return;

            // update activation duration
            if (_activationDuration != pool.activationDuration()) {
                pool.setActivationDuration(_activationDuration);
            }

            // update total activating amount
            uint256 totalActivatingAmount = _beaconActivatingAmount.add(address(pool).balance);
            if (totalActivatingAmount != pool.totalActivatingAmount()) {
                pool.setTotalActivatingAmount(totalActivatingAmount);
            }
        }
    }
}
