// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the Oracles contract.
 */
interface IOracles {
    /**
    * @dev Event for tracking oracle rewards votes.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - current nonce.
    * @param totalRewards - submitted value of total rewards.
    * @param activatedValidators - submitted amount of activated validators.
    */
    event RewardsVoteSubmitted(
        address indexed oracle,
        uint256 nonce,
        uint256 totalRewards,
        uint256 activatedValidators
    );

    /**
    * @dev Event for tracking oracle merkle root votes.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - current nonce.
    * @param merkleRoot - new merkle root.
    * @param merkleProofs - link to the merkle proofs.
    */
    event MerkleRootVoteSubmitted(
        address indexed oracle,
        uint256 nonce,
        bytes32 indexed merkleRoot,
        string merkleProofs
    );

    /**
    * @dev Event for tracking changes of oracles' sync periods.
    * @param syncPeriod - new sync period in blocks.
    * @param sender - address of the transaction sender.
    */
    event SyncPeriodUpdated(uint256 syncPeriod, address indexed sender);

    /**
    * @dev Function for retrieving number of votes of the submission candidate.
    * @param _candidateId - ID of the candidate to retrieve number of votes for.
    */
    function candidates(bytes32 _candidateId) external view returns (uint256);

    /**
    * @dev Function for retrieving oracles sync period (in blocks).
    */
    function syncPeriod() external view returns (uint256);

    /**
    * @dev Function for upgrading the Oracles contract.
    * If deploying contract for the first time, the upgrade function should be replaced with `initialize`
    * and contain initializations from all the previous versions.
    * @param _merkleDistributor - address of the MerkleDistributor contract.
    * @param _syncPeriod - number of blocks to wait before the next sync.
    */
    function upgrade(address _merkleDistributor, uint256 _syncPeriod) external;

    /**
    * @dev Function for checking whether an account has an oracle role.
    * @param _account - account to check.
    */
    function isOracle(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether an oracle has voted.
    * @param oracle - oracle address to check.
    * @param candidateId - hash of nonce and vote parameters.
    */
    function hasVote(address oracle, bytes32 candidateId) external view returns (bool);

    /**
    * @dev Function for checking whether the oracles are currently voting for new total rewards.
    */
    function isRewardsVoting() external view returns (bool);

    /**
    * @dev Function for checking whether the oracles are currently voting for new merkle root.
    */
    function isMerkleRootVoting() external view returns (bool);

    /**
    * @dev Function for retrieving current nonce.
    */
    function currentNonce() external view returns (uint256);

    /**
    * @dev Function for adding an oracle role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign an oracle role to.
    */
    function addOracle(address _account) external;

    /**
    * @dev Function for removing an oracle role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove an oracle role from.
    */
    function removeOracle(address _account) external;

    /**
    * @dev Function for updating oracles sync period. The number of blocks after they will submit the off-chain data.
    * Can only be called by an account with an admin role.
    * @param _syncPeriod - new sync period.
    */
    function setSyncPeriod(uint256 _syncPeriod) external;

    /**
    * @dev Function for submitting oracle vote for total rewards. The last vote required for quorum will update the values.
    * Can only be called by an account with an oracle role.
    * @param _nonce - current nonce.
    * @param _totalRewards - voted total rewards.
    * @param _activatedValidators - voted amount of activated validators.
    */
    function voteForRewards(uint256 _nonce, uint256 _totalRewards, uint256 _activatedValidators) external;

    /**
    * @dev Function for submitting oracle vote for merkle root. The last vote required for quorum will update the values.
    * Can only be called by an account with an oracle role.
    * @param _nonce - current nonce.
    * @param _merkleRoot - hash of the new merkle root.
    * @param _merkleProofs - link to the merkle proofs.
    */
    function voteForMerkleRoot(uint256 _nonce, bytes32 _merkleRoot, string calldata _merkleProofs) external;
}
