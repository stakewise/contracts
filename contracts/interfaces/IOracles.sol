// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

pragma abicoder v2;

/**
 * @dev Interface of the Oracles contract.
 */
interface IOracles {
    /**
    * @dev Event for tracking oracle merkle root votes.
    * @param sender - address of the transaction sender.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - current nonce.
    * @param merkleRoot - new merkle root.
    * @param merkleProofs - link to the merkle proofs.
    */
    event MerkleRootVoteSubmitted(
        address indexed sender,
        address indexed oracle,
        uint256 nonce,
        bytes32 indexed merkleRoot,
        string merkleProofs
    );

    /**
    * @dev Event for tracking new or updates oracles.
    * @param oracle - address of new or updated oracle.
    */
    event OracleAdded(address indexed oracle);

    /**
    * @dev Event for tracking removed oracles.
    * @param oracle - address of removed oracle.
    */
    event OracleRemoved(address indexed oracle);

    /**
    * @dev Function for checking whether an account has an oracle role.
    * @param account - account to check.
    */
    function isOracle(address account) external view returns (bool);

    /**
    * @dev Function for checking whether the oracles are currently voting for new merkle root.
    */
    function isMerkleRootVoting() external view returns (bool);

    /**
    * @dev Function for retrieving current rewards nonce.
    */
    function currentRewardsNonce() external view returns (uint256);

    /**
    * @dev Function for adding an oracle role to the account.
    * Can only be called by an account with an admin role.
    * @param account - account to assign an oracle role to.
    */
    function addOracle(address account) external;

    /**
    * @dev Function for removing an oracle role from the account.
    * Can only be called by an account with an admin role.
    * @param account - account to remove an oracle role from.
    */
    function removeOracle(address account) external;

    /**
    * @dev Function for submitting new merkle root.
    * The quorum of signatures over the same data is required to submit the new value.
    * @param merkleRoot - hash of the new merkle root.
    * @param merkleProofs - link to the merkle proofs.
    * @param signatures - oracles' signatures.
    */
    function submitMerkleRoot(
        bytes32 merkleRoot,
        string calldata merkleProofs,
        bytes[] calldata signatures
    ) external;
}
