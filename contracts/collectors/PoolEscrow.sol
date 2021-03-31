// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IPoolEscrow.sol";

/**
 * @title PoolEscrow
 *
 * @dev PoolEscrow contract is used to receive transfers from ETH2 system contract for the pool validators.
 * The withdrawal credentials of the Pool must be set to
 * https://github.com/ethereum/eth2.0-specs/blob/v1.1.0/specs/phase0/validator.md#eth1_address_withdrawal_prefix
 * using the address of this contract as a destination.
 */
contract PoolEscrow is IPoolEscrow {
    using Address for address payable;

    // @dev The address of the current contract owner.
    address public override owner;

    // @dev The address the ownership is planned to be transferred to.
    address public override futureOwner;

    /**
    * @dev Constructor for initializing the PoolEscrow contract.
    * @param _owner - address of the contract owner.
    */
    constructor(address _owner) {
        owner = _owner;
        emit OwnershipTransferApplied(address(0), _owner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner == msg.sender, "PoolEscrow: caller is not the owner");
        _;
    }

    /**
     * @dev See {IPoolEscrow-commitOwnershipTransfer}.
     */
    function commitOwnershipTransfer(address newOwner) external override onlyOwner {
        require(newOwner != address(0), "PoolEscrow: new owner is the zero address");
        futureOwner = newOwner;
        emit OwnershipTransferCommitted(msg.sender, newOwner);
    }

    /**
     * @dev See {IPoolEscrow-applyOwnershipTransfer}.
     */
    function applyOwnershipTransfer() external override onlyOwner {
        address newOwner = futureOwner;
        require(newOwner != address(0), "PoolEscrow: new owner is the zero address");
        (owner, futureOwner) = (newOwner, address(0));
        emit OwnershipTransferApplied(msg.sender, newOwner);
    }

    /**
     * @dev See {IPoolEscrow-withdraw}.
     */
    function withdraw(address payable payee, uint256 amount) external override onlyOwner {
        payee.sendValue(amount);
        emit Withdrawn(msg.sender, payee, amount);
    }

    /**
    * @dev Function for receiving withdrawals from ETH2 system contract.
    */
    receive() external payable { }
}
