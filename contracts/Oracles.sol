// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardEthToken.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IOracles.sol";
import "./interfaces/IMerkleDistributor.sol";
import "./interfaces/IPoolValidators.sol";


interface IAccessControlUpgradeable {
    /**
     * @dev See {AccessControlUpgradeable-getRoleMemberCount}.
     */
    function getRoleMemberCount(bytes32 role) external view returns (uint256);

    /**
     * @dev See {AccessControlUpgradeable-getRoleMember}.
     */
    function getRoleMember(bytes32 role, uint256 index) external view returns (address);
}

/**
 * @title Oracles
 *
 * @dev Oracles contract stores accounts responsible for submitting or update values based on the off-chain data.
 * The threshold of inputs from different oracles is required to submit the data.
 */
contract Oracles is IOracles, OwnablePausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // @dev Nonce is used to protect from submitting the same vote several times.
    CountersUpgradeable.Counter private nonce;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Address of the Pool contract.
    IPool private pool;

    // @dev Address of the MerkleDistributor contract.
    IMerkleDistributor private merkleDistributor;

    // @dev Defines how often oracles submit data (in blocks).
    uint256 public override syncPeriod;

    /**
     * @dev See {IOracles-initialize}.
     */
    function initialize(
        address _admin,
        address _prevOracles,
        address _rewardEthToken,
        address _pool,
        address _merkleDistributor,
        uint256 _syncPeriod
    )
        external override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);

        // migrate data from previous Oracles contract
        nonce._value = IOracles(_prevOracles).currentNonce();
        uint256 oraclesCount = IAccessControlUpgradeable(_prevOracles).getRoleMemberCount(ORACLE_ROLE);
        for(uint256 i = 0; i < oraclesCount; i++) {
            address oracle = IAccessControlUpgradeable(_prevOracles).getRoleMember(ORACLE_ROLE, i);
            _setupRole(ORACLE_ROLE, oracle);
        }

        rewardEthToken = IRewardEthToken(_rewardEthToken);
        pool = IPool(_pool);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
        syncPeriod = _syncPeriod;
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
     * @dev See {IOracles-submitRewards}.
     */
    function submitRewards(
        uint256 _nonce,
        uint256 totalRewards,
        uint256 activatedValidators,
        bytes[] memory signatures
    )
        external override whenNotPaused
    {
        require(_nonce == nonce.current(), "Oracles: invalid nonce");
        require(isRewardsVoting(), "Oracles: too early");
        require(
            signatures.length.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2),
            "Oracles: invalid number of signatures"
        );

        // calculate candidate ID hash
        bytes32 candidateId = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(abi.encode(_nonce, totalRewards, activatedValidators))
        );

        // check signatures and calculate number of submitted oracle votes
        address[] memory signedOracles = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            bytes memory signature = signatures[i];
            address signer = ECDSAUpgradeable.recover(candidateId, signature);
            require(hasRole(ORACLE_ROLE, signer), "Oracles: invalid signer");

            for (uint256 j = 0; j < i; j++) {
                require(signedOracles[j] != signer, "Oracles: repeated signature");
            }
            signedOracles[i] = signer;
            emit RewardsVoteSubmitted(signer, _nonce, totalRewards, activatedValidators);
        }

        // increment nonce for future signatures
        nonce.increment();

        // update total rewards
        rewardEthToken.updateTotalRewards(totalRewards);

        // update activated validators
        if (activatedValidators != pool.activatedValidators()) {
            pool.setActivatedValidators(activatedValidators);
        }
    }

    /**
     * @dev See {IOracles-submitMerkleRoot}.
     */
    function submitMerkleRoot(
        uint256 _nonce,
        bytes32 merkleRoot,
        string memory merkleProofs,
        bytes[] memory signatures
    )
        external override whenNotPaused
    {
        require(_nonce == nonce.current(), "Oracles: invalid nonce");
        require(isMerkleRootVoting(), "Oracles: too early");
        require(
            signatures.length.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2),
            "Oracles: invalid number of signatures"
        );

        // calculate candidate ID hash
        bytes32 candidateId = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(abi.encode(_nonce, merkleRoot, merkleProofs))
        );

        // check signatures and calculate number of submitted oracle votes
        address[] memory signedOracles = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            bytes memory signature = signatures[i];
            address signer = ECDSAUpgradeable.recover(candidateId, signature);
            require(hasRole(ORACLE_ROLE, signer), "Oracles: invalid signer");

            for (uint256 j = 0; j < i; j++) {
                require(signedOracles[j] != signer, "Oracles: repeated signature");
            }
            signedOracles[i] = signer;
            emit MerkleRootVoteSubmitted(signer, _nonce, merkleRoot, merkleProofs);
        }

        // increment nonce for future signatures
        nonce.increment();

        // update merkle root
        merkleDistributor.setMerkleRoot(merkleRoot, merkleProofs);
    }

    /**
     * @dev See {IOracles-initializeValidator}.
     */
    function initializeValidator(
        uint256 _nonce,
        IPoolValidators.Validator memory validator,
        bytes[] memory signatures
    )
        external override whenNotPaused
    {
        require(_nonce == nonce.current(), "Oracles: invalid nonce");
        require(
            signatures.length.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2),
            "Oracles: invalid number of signatures"
        );

        // calculate candidate ID hash
        bytes32 candidateId = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(abi.encode(_nonce, validator.merkleRoot, validator.index))
        );

        // check signatures and calculate number of submitted oracle votes
        address[] memory signedOracles = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            bytes memory signature = signatures[i];
            address signer = ECDSAUpgradeable.recover(candidateId, signature);
            require(hasRole(ORACLE_ROLE, signer), "Oracles: invalid signer");

            for (uint256 j = 0; j < i; j++) {
                require(signedOracles[j] != signer, "Oracles: repeated signature");
            }
            signedOracles[i] = signer;
            emit InitializeValidatorVoteSubmitted(signer, validator.merkleRoot, validator.index, _nonce);
        }

        // increment nonce for future signatures
        nonce.increment();

        // initialize validator
        pool.initializeValidator(validator);
    }

    /**
     * @dev See {IOracles-finalizeValidator}.
     */
    function finalizeValidator(
        uint256 _nonce,
        IPoolValidators.Validator memory validator,
        bytes[] memory signatures
    )
        external override whenNotPaused
    {
        require(_nonce == nonce.current(), "Oracles: invalid nonce");
        require(
            signatures.length.mul(3) > getRoleMemberCount(ORACLE_ROLE).mul(2),
            "Oracles: invalid number of signatures"
        );

        // calculate candidate ID hash
        bytes32 candidateId = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(abi.encode(_nonce, validator.merkleRoot, validator.index))
        );

        // check signatures and calculate number of submitted oracle votes
        address[] memory signedOracles = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            bytes memory signature = signatures[i];
            address signer = ECDSAUpgradeable.recover(candidateId, signature);
            require(hasRole(ORACLE_ROLE, signer), "Oracles: invalid signer");

            for (uint256 j = 0; j < i; j++) {
                require(signedOracles[j] != signer, "Oracles: repeated signature");
            }
            signedOracles[i] = signer;
            emit FinalizeValidatorVoteSubmitted(signer, validator.merkleRoot, validator.index, _nonce);
        }

        // increment nonce for future signatures
        nonce.increment();

        // finalize validator
        pool.finalizeValidator(validator);
    }
}
