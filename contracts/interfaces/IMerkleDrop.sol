// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the MerkleDrop contract.
 * Allows anyone to claim a token if they exist in a merkle root.
 */
interface IMerkleDrop {
    /**
    * @dev Event for tracking token claims.
    * @param account - the address of the user that has claimed the tokens.
    * @param index - the index of the user that has claimed the tokens.
    * @param amount - the amount of tokens that the user has claimed.
    */
    event Claimed(uint256 index, address indexed account, uint256 amount);

    /**
    * @dev Event for tracking stoppage of the merkle drop.
    * @param beneficiary - the address where the left tokens will be directed.
    * @param amount - the amount of tokens that the were transferred to the beneficiary.
    */
    event Stopped(address indexed beneficiary, uint256 amount);

    /**
    * @dev Function for retrieving the current merkle root.
    */
    function merkleRoot() external view returns (bytes32);

    /**
    * @dev Function for retrieving the token contract address.
    */
    function token() external view returns (IERC20);

    /**
    * @dev Function for retrieving the expire timestamp of the merkle drop.
    */
    function expireTimestamp() external view returns (uint256);

    /**
    * @dev Function for checking the claimed bit map.
    * @param wordIndex - the word index of te bit map.
    */
    function claimedBitMap(uint256 wordIndex) external view returns (uint256);

    /**
    * @dev Function for checking whether the tokens were already claimed.
    * @param index - the index of the user that is part of the merkle root.
    */
    function isClaimed(uint256 index) external view returns (bool);

    /**
    * @dev Function for claiming the tokens to the account address.
    * @param index - the index of the user that is part of the merkle root.
    * @param account - the address of the user that is part of the merkle root.
    * @param amount - the amount of tokens that the user was allocated.
    * @param merkleProof - an array of hashes to verify whether the user is part of the merkle root.
    */
    function claim(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external;

    /**
    * @dev Function for stopping the expired merkle drop. Can only be called by the contract owner.
    * @param beneficiary - the address of the beneficiary where the left tokens will be transferred.
    */
    function stop(address beneficiary) external;
}
