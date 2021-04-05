// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the PoolEscrow contract.
 */
interface IPoolEscrow {
    /**
    * @dev Event for tracking withdrawn ether.
    * @param sender - the address of the transaction sender.
    * @param payee - the address where the funds were transferred to.
    * @param amount - the amount of ether transferred to payee.
    */
    event Withdrawn(address indexed sender, address indexed payee, uint256 amount);

    /**
    * @dev Event for tracking ownership transfers.
    * @param previousOwner - the address of the previous owner.
    * @param newOwner - the address of the new owner.
    */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
    * @dev Function for retrieving the address of the current owner.
    */
    function owner() external view returns (address);

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) external;

    /**
     * @dev Withdraw balance for a payee, forwarding all gas to the
     * recipient. Can only be called by the current owner.
     *
     * WARNING: Forwarding all gas opens the door to reentrancy vulnerabilities.
     * Make sure you trust the recipient, or are either following the
     * checks-effects-interactions pattern or using {ReentrancyGuard}.
     *
     * @param payee - the address where the funds will be transferred to.
     * @param amount - the amount of ether to transfer to payee.
     */
    function withdraw(address payable payee, uint256 amount) external;
}
