// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./presets/OwnablePausableUpgradeable.sol";
import "./interfaces/IRewardToken.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IOracles.sol";
import "./interfaces/IMerkleDistributor.sol";
import "./interfaces/IPoolValidators.sol";

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

    // @dev Rewards nonce is used to protect from submitting the same rewards vote several times.
    CountersUpgradeable.Counter private rewardsNonce;

    // @dev Validators nonce is used to protect from submitting the same validator vote several times.
    CountersUpgradeable.Counter private validatorsNonce;

    // @dev Address of the RewardToken contract.
    IRewardToken private rewardToken;

    // @dev Address of the Pool contract.
    IPool private pool;

    // @dev Address of the PoolValidators contract.
    IPoolValidators private poolValidators;

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
     * @dev See {IOracles-currentRewardsNonce}.
     */
    function currentRewardsNonce() external override view returns (uint256) {
        return rewardsNonce.current();
    }

    /**
     * @dev See {IOracles-isOracle}.
     */
    function isOracle(address account) external override view returns (bool) {
        return hasRole(ORACLE_ROLE, account);
    }

    /**
     * @dev See {IOracles-addOracle}.
     */
    function addOracle(address account) external override {
        require(account != address(0), "Oracles: invalid oracle address");
        grantRole(ORACLE_ROLE, account);
        emit OracleAdded(account);
    }

    /**
     * @dev See {IOracles-removeOracle}.
     */
    function removeOracle(address account) external override {
        revokeRole(ORACLE_ROLE, account);
        emit OracleRemoved(account);
    }

    /**
     * @dev See {IOracles-isMerkleRootVoting}.
     */
    function isMerkleRootVoting() public override view returns (bool) {
        uint256 lastRewardBlockNumber = rewardToken.lastUpdateBlockNumber();
        return merkleDistributor.lastUpdateBlockNumber() < lastRewardBlockNumber && lastRewardBlockNumber != block.number;
    }

    /**
    * @dev Function for checking whether number of signatures is enough to update the value.
    * @param signaturesCount - number of signatures.
    */
    function isEnoughSignatures(uint256 signaturesCount) internal view returns (bool) {
        uint256 totalOracles = getRoleMemberCount(ORACLE_ROLE);
        return totalOracles >= signaturesCount && signaturesCount.mul(3) > totalOracles.mul(2);
    }

    /**
     * @dev See {IOracles-submitMerkleRoot}.
     */
    function submitMerkleRoot(
        bytes32 merkleRoot,
        string calldata merkleProofs,
        bytes[] calldata signatures
    )
        external override onlyOracle whenNotPaused
    {
        require(isMerkleRootVoting(), "Oracles: too early");
        require(isEnoughSignatures(signatures.length), "Oracles: invalid number of signatures");

        // calculate candidate ID hash
        uint256 nonce = rewardsNonce.current();
        bytes32 candidateId = ECDSAUpgradeable.toEthSignedMessageHash(
            keccak256(abi.encode(nonce, merkleProofs, merkleRoot))
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
            emit MerkleRootVoteSubmitted(msg.sender, signer, nonce, merkleRoot, merkleProofs);
        }

        // increment nonce for future signatures
        rewardsNonce.increment();

        // update merkle root
        merkleDistributor.setMerkleRoot(merkleRoot, merkleProofs);
    }
}
