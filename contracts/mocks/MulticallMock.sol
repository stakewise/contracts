// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;


import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IOracles.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IRewardToken.sol";

contract MulticallMock {
    struct MerkleRoot {
        bytes32 merkleRoot;
        string merkleProofs;
        bytes[] signatures;
    }

    IOracles private oracles;
    IERC20Upgradeable private stakedToken;
    IRewardToken private rewardToken;
    IMerkleDistributor private merkleDistributor;

    constructor(address _oracles, address _stakedToken, address _rewardToken, address _merkleDistributor) {
        oracles = IOracles(_oracles);
        stakedToken = IERC20Upgradeable(_stakedToken);
        rewardToken = IRewardToken(_rewardToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    function transferRewardsAndUpdateTotalRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        rewardToken.transferFrom(msg.sender, payee, rewardToken.balanceOf(msg.sender));
        rewardToken.updateTotalRewards(rewardsDelta);
    }

    function updateTotalRewardsAndTransferRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        rewardToken.updateTotalRewards(rewardsDelta);
        rewardToken.transferFrom(msg.sender, payee, rewardToken.balanceOf(msg.sender));
    }

    function updateTotalRewardsAndMigrate(int256 rewardsDelta) external {
        rewardToken.updateTotalRewards(rewardsDelta);
        rewardToken.migrate(
            msg.sender,
            stakedToken.balanceOf(address(this)),
            rewardToken.balanceOf(address(this))
        );
    }

    function updateTotalRewardsAndClaim(
        int256 rewardsDelta,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        rewardToken.updateTotalRewards(rewardsDelta);
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
    }

    function claimAndUpdateTotalRewards(
        int256 rewardsDelta,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
        rewardToken.updateTotalRewards(rewardsDelta);
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

    function updateTotalRewardsAndTransferStakedEth(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        rewardToken.updateTotalRewards(rewardsDelta);
        stakedToken.transferFrom(msg.sender, payee, stakedToken.balanceOf(msg.sender));
    }

    function transferStakedEthAndUpdateTotalRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        stakedToken.transferFrom(msg.sender, payee, stakedToken.balanceOf(msg.sender));
        rewardToken.updateTotalRewards(rewardsDelta);
    }

    function updateTotalRewardsAndMerkleRoot(
        int256 rewardsDelta,
        MerkleRoot memory merkleRoot
    )
        external
    {
        rewardToken.updateTotalRewards(rewardsDelta);
        oracles.submitMerkleRoot(merkleRoot.merkleRoot, merkleRoot.merkleProofs, merkleRoot.signatures);
    }
}
