// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IOracles.sol";
import "../interfaces/IMerkleDistributor.sol";

contract OracleMock {
    IOracles private oracles;
    IERC20Upgradeable private stakedEthToken;
    IERC20Upgradeable private rewardEthToken;
    IMerkleDistributor private merkleDistributor;

    constructor(address _oracles, address _stakedEthToken, address _rewardEthToken, address _merkleDistributor) {
        oracles = IOracles(_oracles);
        stakedEthToken = IERC20Upgradeable(_stakedEthToken);
        rewardEthToken = IERC20Upgradeable(_rewardEthToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    function updateTotalRewards(uint256 totalRewards, uint256 activatedValidators) external {
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
    }

    function updateTotalRewardsAndMerkleRoot(
        uint256 totalRewards,
        uint256 activatedValidators,
        bytes32 merkleRoot,
        string calldata merkleProofs
    )
        external
    {
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
        oracles.voteForMerkleRoot(oracles.currentNonce(), merkleRoot, merkleProofs);
    }

    function updateTotalRewardsAndTransferRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
    }

    function transferRewardsAndUpdateTotalRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        rewardEthToken.transferFrom(msg.sender, payee, rewardEthToken.balanceOf(msg.sender));
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
    }

    function updateTotalRewardsAndTransferStakedEth(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
    }

    function transferStakedEthAndUpdateTotalRewards(uint256 totalRewards, uint256 activatedValidators, address payee) external {
        stakedEthToken.transferFrom(msg.sender, payee, stakedEthToken.balanceOf(msg.sender));
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
    }

    function updateTotalRewardsAndClaim(
        uint256 totalRewards,
        uint256 activatedValidators,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
    }

    function claimAndUpdateTotalRewards(
        uint256 totalRewards,
        uint256 activatedValidators,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof
    )
        external
    {
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
        oracles.voteForRewards(oracles.currentNonce(), totalRewards, activatedValidators);
    }

    function updateMerkleRootAndClaim(
        bytes32 merkleRoot,
        string calldata merkleProofs,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof

    )
        external
    {
        oracles.voteForMerkleRoot(oracles.currentNonce(), merkleRoot, merkleProofs);
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
    }

    function claimAndUpdateMerkleRoot(
        bytes32 merkleRoot,
        string calldata merkleProofs,
        uint256 index,
        address account,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[] calldata merkleProof

    )
        external
    {
        merkleDistributor.claim(index, account, tokens, amounts, merkleProof);
        oracles.voteForMerkleRoot(oracles.currentNonce(), merkleRoot, merkleProofs);
    }
}
