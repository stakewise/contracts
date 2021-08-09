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
    * @dev Event for tracking validator initialization votes.
    * @param signer - address of the signed oracle.
    * @param merkleRoot - validator initialization merkle root.
    * @param index - validator initialization index.
    * @param nonce - validator initialization nonce.
    */
    event InitializeValidatorVoteSubmitted(
        address indexed signer,
        bytes32 indexed merkleRoot,
        uint256 index,
        uint256 nonce
    );

    /**
    * @dev Event for tracking validator finalization votes.
    * @param signer - address of the signed oracle.
    * @param merkleRoot - validator finalization merkle root.
    * @param index - validator finalization index.
    * @param nonce - validator finalization nonce.
    */
    event FinalizeValidatorVoteSubmitted(
        address indexed signer,
        bytes32 indexed merkleRoot,
        uint256 index,
        uint256 nonce
    );

    /**
    * @dev Function for retrieving oracles sync period (in blocks).
    */
    function syncPeriod() external view returns (uint256);

    /**
    * @dev Constructor for initializing the Oracles contract.
    * @param _admin - address of the contract admin.
    * @param _prevOracles - address of the previous Oracles contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _pool - address of the Pool contract.
    * @param _merkleDistributor - address of the MerkleDistributor contract.
    * @param _syncPeriod - oracles sync period (in blocks).
    */
    function initialize(
        address _admin,
        address _prevOracles,
        address _rewardEthToken,
        address _pool,
        address _merkleDistributor,
        uint256 _syncPeriod
    ) external;

    /**
    * @dev Function for checking whether an account has an oracle role.
    * @param _account - account to check.
    */
    function isOracle(address _account) external view returns (bool);

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
    * @dev Function for submitting oracle vote for total rewards.
    * The quorum of signatures over the same data is required to submit the new value.
    * @param _nonce - current nonce.
    * @param totalRewards - voted total rewards.
    * @param activatedValidators - voted amount of activated validators.
    * @param signatures - oracles' signatures.
    */
    function submitRewards(
        uint256 _nonce,
        uint256 totalRewards,
        uint256 activatedValidators,
        bytes[] calldata signatures
    ) external;

    /**
    * @dev Function for submitting new merkle root.
    * The quorum of signatures over the same data is required to submit the new value.
    * @param _nonce - current nonce.
    * @param merkleRoot - hash of the new merkle root.
    * @param merkleProofs - link to the merkle proofs.
    * @param signatures - oracles' signatures.
    */
    function submitMerkleRoot(
        uint256 _nonce,
        bytes32 merkleRoot,
        string memory merkleProofs,
        bytes[] memory signatures
    ) external;

    /**
    * @dev Function for submitting initializing new validator.
    * The quorum of signatures over the same data is required to initialize.
    * @param _nonce - current nonce.
    * @param validator - new validator.
    * @param signatures - oracles' signatures.
    */
    function initializeValidator(
        uint256 _nonce,
        IPoolValidators.Validator memory validator,
        bytes[] memory signatures
    ) external;

    /**
    * @dev Function for submitting finalizing new validator.
    * The quorum of signatures over the same data is required to finalize.
    * @param _nonce - current nonce.
    * @param validator - new validator.
    * @param signatures - oracles' signatures.
    */
    function finalizeValidator(
        uint256 _nonce,
        IPoolValidators.Validator memory validator,
        bytes[] memory signatures
    ) external;
}
