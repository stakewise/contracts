// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;


import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IOracles.sol";
import "../interfaces/IMerkleDistributor.sol";

contract MulticallMock {
    struct OracleRewards {
        uint256 totalRewards;
        uint256 activatedValidators;
        bytes[] signatures;
    }

    struct MerkleRoot {
        bytes32 merkleRoot;
        string merkleProofs;
        bytes[] signatures;
    }

    IOracles private oracles;
    IERC20Upgradeable private stakedToken;
    IERC20Upgradeable private rewardToken;
    IMerkleDistributor private merkleDistributor;

    constructor(address _oracles, address _stakedToken, address _rewardToken, address _merkleDistributor) {
        oracles = IOracles(_oracles);
        stakedToken = IERC20Upgradeable(_stakedToken);
        rewardToken = IERC20Upgradeable(_rewardToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    function transferRewardsAndUpdateTotalRewards(
        uint256 totalRewards,
        uint256 activatedValidators,
        address payee,
        bytes[] calldata signatures
    )
        external
    {
        rewardToken.transferFrom(msg.sender, payee, rewardToken.balanceOf(msg.sender));
        oracles.submitRewards(totalRewards, activatedValidators, signatures);
    }

    function updateTotalRewardsAndTransferRewards(
        uint256 totalRewards,
        uint256 activatedValidators,
        address payee,
        bytes[] calldata signatures
    )
        external
    {
        oracles.submitRewards(totalRewards, activatedValidators, signatures);
        rewardToken.transferFrom(msg.sender, payee, rewardToken.balanceOf(msg.sender));
    }

    function updateTotalRewardsAndClaim(
        OracleRewards memory oracleRewards,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        oracles.submitRewards(oracleRewards.totalRewards, oracleRewards.activatedValidators, oracleRewards.signatures);
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
    }

    function claimAndUpdateTotalRewards(
        OracleRewards memory oracleRewards,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
        oracles.submitRewards(oracleRewards.totalRewards, oracleRewards.activatedValidators, oracleRewards.signatures);
    }

    function claimAndUpdateMerkleRoot(
        MerkleRoot memory merkleRoot,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
        oracles.submitMerkleRoot(merkleRoot.merkleRoot, merkleRoot.merkleProofs, merkleRoot.signatures);
    }

    function updateMerkleRootAndClaim(
        MerkleRoot memory merkleRoot,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        oracles.submitMerkleRoot(merkleRoot.merkleRoot, merkleRoot.merkleProofs, merkleRoot.signatures);
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
    }

    function updateTotalRewardsAndTransferStakedTokens(
        uint256 totalRewards,
        uint256 activatedValidators,
        address payee,
        bytes[] calldata signatures
    )
        external
    {
        oracles.submitRewards(totalRewards, activatedValidators, signatures);
        stakedToken.transferFrom(msg.sender, payee, stakedToken.balanceOf(msg.sender));
    }

    function transferStakedTokensAndUpdateTotalRewards(
        uint256 totalRewards,
        uint256 activatedValidators,
        address payee,
        bytes[] calldata signatures
    )
        external
    {
        stakedToken.transferFrom(msg.sender, payee, stakedToken.balanceOf(msg.sender));
        oracles.submitRewards(totalRewards, activatedValidators, signatures);
    }

    function updateTotalRewardsAndMerkleRoot(
        OracleRewards memory oracleRewards,
        MerkleRoot memory merkleRoot
    )
        external
    {
        oracles.submitRewards(oracleRewards.totalRewards, oracleRewards.activatedValidators, oracleRewards.signatures);
        oracles.submitMerkleRoot(merkleRoot.merkleRoot, merkleRoot.merkleProofs, merkleRoot.signatures);
    }
}
