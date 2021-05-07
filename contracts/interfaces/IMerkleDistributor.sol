// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./IOracles.sol";

/**
 * @dev Interface of the MerkleDistributor contract.
 * Allows anyone to claim a token if they exist in a merkle root.
 */
interface IMerkleDistributor {
    /**
    * @dev Event for tracking merkle root updates.
    * @param sender - address of the new transaction sender.
    * @param merkleRoot - new merkle root hash.
    * @param merkleProofs - link to the merkle proofs.
    */
    event MerkleRootUpdated(
        address indexed sender,
        bytes32 indexed merkleRoot,
        string merkleProofs
    );

    /**
    * @dev Event for tracking SWISE token distributions.
    * @param sender - address of the new transaction sender.
    * @param token - address of the token.
    * @param beneficiary - address of the beneficiary, the SWISE allocation is added to.
    * @param amount - amount of tokens distributed.
    * @param startBlock - start block of the tokens distribution.
    * @param endBlock - end block of the tokens distribution.
    */
    event DistributionAdded(
        address indexed sender,
        address indexed token,
        address indexed beneficiary,
        uint256 amount,
        uint256 startBlock,
        uint256 endBlock
    );

    /**
    * @dev Event for tracking tokens' claims.
    * @param account - the address of the user that has claimed the tokens.
    * @param index - the index of the user that has claimed the tokens.
    * @param tokens - list of token addresses the user got amounts in.
    * @param amounts - list of user token amounts.
    */
    event Claimed(address indexed account, uint256 index, address[] tokens, uint256[] amounts);

    /**
    * @dev Function for getting the current merkle root.
    */
    function merkleRoot() external view returns (bytes32);

    /**
    * @dev Function for getting the RewardEthToken contract address.
    */
    function rewardEthToken() external view returns (address);

    /**
    * @dev Function for getting the Oracles contract address.
    */
    function oracles() external view returns (IOracles);

    /**
    * @dev Function for retrieving the last total merkle root update block number.
    */
    function lastUpdateBlockNumber() external view returns (uint256);

    /**
    * @dev Constructor for initializing the MerkleDistributor contract.
    * @param _admin - address of the contract admin.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _oracles - address of the Oracles contract.
    */
    function initialize(address _admin, address _rewardEthToken, address _oracles) external;

    /**
    * @dev Function for checking the claimed bit map.
    * @param _merkleRoot - the merkle root hash.
    * @param _wordIndex - the word index of te bit map.
    */
    function claimedBitMap(bytes32 _merkleRoot, uint256 _wordIndex) external view returns (uint256);

    /**
    * @dev Function for changing the merkle root. Can only be called by `Oracles` contract.
    * @param newMerkleRoot - new merkle root hash.
    * @param merkleProofs - URL to the merkle proofs.
    */
    function setMerkleRoot(bytes32 newMerkleRoot, string calldata merkleProofs) external;

    /**
    * @dev Function for adding tokens distribution.
    * @param token - address of the token.
    * @param beneficiary - address of the beneficiary.
    * @param amount - amount of tokens to distribute.
    * @param durationInBlocks - duration in blocks when the token distribution should be stopped.
    */
    function distribute(
        address token,
        address beneficiary,
        uint256 amount,
        uint256 durationInBlocks
    ) external;

    /**
    * @dev Function for checking whether the tokens were already claimed.
    * @param index - the index of the user that is part of the merkle root.
    */
    function isClaimed(uint256 index) external view returns (bool);

    /**
    * @dev Function for claiming the given amount of tokens to the account address.
    * Reverts if the inputs are invalid or the oracles are currently updating the merkle root.
    * @param index - the index of the user that is part of the merkle root.
    * @param account - the address of the user that is part of the merkle root.
    * @param tokens - list of the token addresses.
    * @param amounts - list of token amounts.
    * @param merkleProof - an array of hashes to verify whether the user is part of the merkle root.
    */
    function claim(
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    ) external;
}
