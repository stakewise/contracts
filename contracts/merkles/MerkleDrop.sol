// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMerkleDrop.sol";


/**
 * @title MerkleDrop
 *
 * @dev MerkleDrop contract allows users to claim their tokens by proving that they're part of the merkle tree.
 * Adopted from https://github.com/Uniswap/merkle-distributor/blob/0d478d722da2e5d95b7292fd8cbdb363d98e9a93/contracts/MerkleDistributor.sol
 */
contract MerkleDrop is IMerkleDrop, Ownable {
    using SafeERC20 for IERC20;

    // @dev Address of the token contract.
    IERC20 public immutable override token;

    // @dev Merkle Root for proving tokens ownership.
    bytes32 public immutable override merkleRoot;

    // @dev Expire timestamp for te merkle drop.
    uint256 public immutable override expireTimestamp;

    // This is a packed array of booleans.
    mapping(uint256 => uint256) public override claimedBitMap;

    /**
    * @dev Constructor for initializing the MerkleDrop contract.
    * @param _owner - address of the contract owner.
    * @param _token - address of the token contract.
    * @param _merkleRoot - address of the merkle root.
    * @param _duration - duration of the merkle drop in seconds.
    */
    constructor(address _owner, address _token, bytes32 _merkleRoot, uint256 _duration) {
        token = IERC20(_token);
        merkleRoot = _merkleRoot;
        // solhint-disable-next-line not-rely-on-time
        expireTimestamp = block.timestamp + _duration;
        transferOwnership(_owner);
    }

    /**
     * @dev See {IMerkleDrop-isClaimed}.
     */
    function isClaimed(uint256 index) public view override returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[claimedWordIndex] = claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
    }

    /**
     * @dev See {IMerkleDrop-claim}.
     */
    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external override {
        require(!isClaimed(index), "MerkleDrop: drop already claimed");

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), "MerkleDrop: invalid proof");

        // Mark it claimed and send the token.
        _setClaimed(index);
        token.safeTransfer(account, amount);
        emit Claimed(index, account, amount);
    }

    /**
     * @dev See {IMerkleDrop-stop}.
     */
    function stop(address beneficiary) external override onlyOwner {
        require(beneficiary != address(0), "MerkleDrop: beneficiary is the zero address");
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp >= expireTimestamp, "MerkleDrop: not expired");
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(beneficiary, amount);
        emit Stopped(beneficiary, amount);
    }
}
