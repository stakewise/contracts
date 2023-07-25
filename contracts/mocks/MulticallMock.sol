// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;


import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IOracles.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IRewardEthToken.sol";

contract MulticallMock {
    struct MerkleRoot {
        bytes32 merkleRoot;
        string merkleProofs;
        bytes[] signatures;
    }

    IOracles private oracles;
    IERC20Upgradeable private stakedEthToken;
    IRewardEthToken private rewardEthToken;
    IMerkleDistributor private merkleDistributor;

    constructor(address _oracles, address _stakedEthToken, address _rewardEthToken, address _merkleDistributor) {
        oracles = IOracles(_oracles);
        stakedEthToken = IERC20Upgradeable(_stakedEthToken);
        rewardEthToken = IRewardEthToken(_rewardEthToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    function transferRewardsAndUpdateTotalRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
        rewardEthToken.updateTotalRewards(rewardsDelta);
    }

    function updateTotalRewardsAndTransferRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        rewardEthToken.updateTotalRewards(rewardsDelta);
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
    }

    function updateTotalRewardsAndMigrate(int256 rewardsDelta) external {
        rewardEthToken.updateTotalRewards(rewardsDelta);
        rewardEthToken.migrate(
            msg.sender,
            stakedEthToken.balanceOf(address(this)),
            rewardEthToken.balanceOf(address(this))
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
        rewardEthToken.updateTotalRewards(rewardsDelta);
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
        rewardEthToken.updateTotalRewards(rewardsDelta);
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
        rewardEthToken.updateTotalRewards(rewardsDelta);
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
    }

    function transferStakedEthAndUpdateTotalRewards(
        int256 rewardsDelta,
        address payee
    )
        external
    {
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
        rewardEthToken.updateTotalRewards(rewardsDelta);
    }

    function updateTotalRewardsAndMerkleRoot(
        int256 rewardsDelta,
        MerkleRoot memory merkleRoot
    )
        external
    {
        rewardEthToken.updateTotalRewards(rewardsDelta);
        oracles.submitMerkleRoot(merkleRoot.merkleRoot, merkleRoot.merkleProofs, merkleRoot.signatures);
    }
}
