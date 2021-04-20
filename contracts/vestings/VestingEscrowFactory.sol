// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IVestingEscrowFactory.sol";
import "../interfaces/IVestingEscrow.sol";


/**
 * @title VestingEscrowFactory
 *
 * @dev VestingEscrowFactory contract creates new vesting escrows and keeps track of total unclaimed balances of the users.
 * Only admin can create new vesting escrows.
 */
contract VestingEscrowFactory is IVestingEscrowFactory, ReentrancyGuardUpgradeable, OwnablePausableUpgradeable {
    using ClonesUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    // @dev Address of the escrow implementation contract.
    address public override escrowImplementation;

    // @dev Maps address of the beneficiary to its vesting escrows.
    mapping(address => address[]) private escrows;

    /**
     * @dev See {IVestingEscrowFactory-upgrade}.
     * The `initialize` must be called before upgrading in previous implementation contract:
     * https://github.com/stakewise/contracts/blob/f865adf3b90818e6d8b9d8af01080842fb24aa16/contracts/vestings/VestingEscrowFactory.sol#L35
     */
    function upgrade(address _escrowImplementation) external override onlyAdmin whenPaused {
        require(_escrowImplementation != escrowImplementation, "VestingEscrowFactory: already upgraded");
        escrowImplementation = _escrowImplementation;
    }

    /**
     * @dev See {IVestingEscrowFactory-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256 total) {
        uint256 escrowsCount = escrows[account].length;
        for (uint256 i = 0; i < escrowsCount; i++) {
            total = total.add(IVestingEscrow(escrows[account][i]).unclaimedAmount());
        }
    }

    /**
     * @dev See {IVestingEscrowFactory-deployEscrow}.
     */
    function deployEscrow(
        address token,
        address recipient,
        address beneficiary,
        uint256 amount,
        uint256 vestingStart,
        uint256 vestingDuration,
        uint256 cliffLength
    )
        external override onlyAdmin whenNotPaused nonReentrant returns (address escrow)
    {
        require(cliffLength <= vestingDuration, "VestingEscrowFactory: invalid cliff");
        require(recipient != address(0), "PoolEscrow: recipient is the zero address");
        require(beneficiary != address(0), "PoolEscrow: beneficiary is the zero address");

        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);

        escrow = escrowImplementation.clone();
        IERC20Upgradeable(token).safeApprove(escrow, amount);
        escrows[recipient].push(escrow);

        // solhint-disable-next-line not-rely-on-time
        if (vestingStart == 0) vestingStart = block.timestamp;
        uint256 vestingEnd = vestingStart.add(vestingDuration);
        IVestingEscrow(escrow).initialize(
            msg.sender,
            token,
            recipient,
            beneficiary,
            amount,
            vestingStart,
            vestingEnd,
            cliffLength
        );
        emit VestingEscrowCreated(
            msg.sender,
            token,
            recipient,
            beneficiary,
            escrow,
            amount,
            vestingStart,
            vestingEnd,
            cliffLength
        );
    }
}
