// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "./IPoolValidators.sol";
pragma abicoder v2;

/**
 * @dev Interface of the Oracles contract.
 */
interface IOracles {
    /**
    * @dev Event for tracking oracle rewards votes.
    * @param sender - address of the transaction sender.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - current nonce.
    * @param totalRewards - submitted value of total rewards.
    * @param activatedValidators - submitted amount of activated validators.
    */
    event RewardsVoteSubmitted(
        address indexed sender,
        address indexed oracle,
        uint256 nonce,
        uint256 totalRewards,
        uint256 activatedValidators
    );

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
    * @dev Event for tracking validator initialization votes.
    * @param sender - address of the transaction sender.
    * @param signer - address of the signed oracle.
    * @param operator - address of the operator the vote was sent for.
    * @param publicKey - public key of the validator the vote was sent for.
    * @param nonce - validator initialization nonce.
    */
    event InitializeValidatorVoteSubmitted(
        address indexed sender,
        address indexed signer,
        address indexed operator,
        bytes publicKey,
        uint256 nonce
    );

    /**
    * @dev Event for tracking validator finalization votes.
    * @param sender - address of the transaction sender.
    * @param signer - address of the signed oracle.
    * @param operator - address of the operator the vote was sent for.
    * @param publicKey - public key of the validator the vote was sent for.
    * @param nonce - validator finalization nonce.
    */
    event FinalizeValidatorVoteSubmitted(
        address indexed sender,
        address indexed signer,
        address indexed operator,
        bytes publicKey,
        uint256 nonce
    );

    /**
    * @dev Event for tracking new or updates oracles.
    * @param oracle - address of new or updated oracle.
    * @param rewardVotesSource - the new or updated source from where the votes for the rewards can be fetched.
    * @param validatorVotesSource - the new or updated source from where the votes for the validators can be fetched.
    */
    event OracleAdded(address indexed oracle, string rewardVotesSource, string validatorVotesSource);

    /**
    * @dev Event for tracking removed oracles.
    * @param oracle - address of removed oracle.
    */
    event OracleRemoved(address indexed oracle);

    /**
    * @dev Constructor for initializing the Oracles contract.
    * @param admin - address of the contract admin.
    * @param prevOracles - address of the previous Oracles contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _pool - address of the Pool contract.
    * @param _poolValidators - address of the PoolValidators contract.
    * @param _merkleDistributor - address of the MerkleDistributor contract.
    * @param rewardVotesSources - array of reward votes sources that correspond to the oracle addresses.
    * @param validatorVotesSources - array of validator votes sources that correspond to the oracle addresses.
    */
    function initialize(
        address admin,
        address prevOracles,
        address _rewardEthToken,
        address _pool,
        address _poolValidators,
        address _merkleDistributor,
        string[] memory rewardVotesSources,
        string[] memory validatorVotesSources
    ) external;

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
    * @dev Function for retrieving current validators nonce.
    */
    function currentValidatorsNonce() external view returns (uint256);

    /**
    * @dev Function for adding an oracle role to the account.
    * Can only be called by an account with an admin role.
    * @param account - account to assign an oracle role to.
    * @param rewardVotesSource - source where the votes for new reward will be published by oracle.
    * @param validatorVotesSource - source where the votes for new validator will be published by oracle.
    */
    function addOracle(address account, string memory rewardVotesSource, string memory validatorVotesSource) external;

    /**
    * @dev Function for removing an oracle role from the account.
    * Can only be called by an account with an admin role.
    * @param account - account to remove an oracle role from.
    */
    function removeOracle(address account) external;

    /**
    * @dev Function for submitting oracle vote for total rewards.
    * The quorum of signatures over the same data is required to submit the new value.
    * @param totalRewards - voted total rewards.
    * @param activatedValidators - voted amount of activated validators.
    * @param signatures - oracles' signatures.
    */
    function submitRewards(
        uint256 totalRewards,
        uint256 activatedValidators,
        bytes[] calldata signatures
    ) external;

    /**
    * @dev Function for submitting new merkle root.
    * The quorum of signatures over the same data is required to submit the new value.
    * @param merkleRoot - hash of the new merkle root.
    * @param merkleProofs - link to the merkle proofs.
    * @param signatures - oracles' signatures.
    */
    function submitMerkleRoot(
        bytes32 merkleRoot,
        string memory merkleProofs,
        bytes[] memory signatures
    ) external;

    /**
    * @dev Function for submitting initialization of the new validator.
    * The quorum of signatures over the same data is required to initialize.
    * @param depositData - the deposit data for the initialization.
    * @param merkleProof - an array of hashes to verify whether the deposit data is part of the initialize merkle root.
    * @param signatures - oracles' signatures.
    */
    function initializeValidator(
        IPoolValidators.DepositData memory depositData,
        bytes32[] memory merkleProof,
        bytes[] memory signatures
    ) external;

    /**
    * @dev Function for submitting finalization of the new validator.
    * The quorum of signatures over the same data is required to finalize.
    * @param depositData - the deposit data for the finalization.
    * @param merkleProof - an array of hashes to verify whether the deposit data is part of the finalize merkle root.
    * @param signatures - oracles' signatures.
    */
    function finalizeValidator(
        IPoolValidators.DepositData memory depositData,
        bytes32[] memory merkleProof,
        bytes[] memory signatures
    ) external;
}
