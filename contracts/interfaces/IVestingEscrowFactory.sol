// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the VestingEscrowFactory contract.
 */
interface IVestingEscrowFactory {
    /**
    * @dev Event for tracking created vesting escrows.
    * @param admin - address of the contract admin.
    * @param token - address of the token.
    * @param recipient - address of the recipient of the tokens.
    * @param beneficiary - address of the tokens beneficiary.
    * @param escrow - address of the escrow contract.
    * @param totalAmount - amount of tokens to vest.
    * @param startTime - start timestamp of the vesting in seconds.
    * @param endTime - end timestamp of the vesting in seconds.
    * @param cliffLength - cliff length in seconds.
    */
    event VestingEscrowCreated(
        address indexed admin,
        address indexed token,
        address indexed recipient,
        address beneficiary,
        address escrow,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        uint256 cliffLength
    );

    /**
    * @dev Function for upgrading the VestingEscrowFactory contract.
    * @param _escrowImplementation - address of the VestingEscrow implementation contract.
    */
    function upgrade(address _escrowImplementation) external;

    /**
    * @dev Function for fetching escrow implementation contract.
    */
    function escrowImplementation() external view returns (address);

    /**
    * @dev Function for checking the total locked amount for all the escrows of the user.
    * @param account - account to check the balance for.
    */
    function balanceOf(address account) external view returns (uint256 total);

    /**
    * @dev Function for deploying new escrow contract.
    * @param token - address of the token contract.
    * @param recipient - address of the recipient of the tokens.
    * @param beneficiary - address where the tokens will be sent.
    * @param amount - amount of tokens to vest.
    * @param vestingStart - start timestamp of the vesting in seconds.
    * @param vestingDuration - vesting duration in seconds.
    * @param cliffLength - cliff length in seconds.
    */
    function deployEscrow(
        address token,
        address recipient,
        address beneficiary,
        uint256 amount,
        uint256 vestingStart,
        uint256 vestingDuration,
        uint256 cliffLength
    ) external returns (address escrow);
}
