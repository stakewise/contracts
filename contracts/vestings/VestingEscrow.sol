// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IVestingEscrow.sol";


/**
 * @title VestingEscrow
 *
 * @dev VestingEscrow contract vests tokens over a period of time with optional cliff.
 * Admin user can stop the vesting and withdraw locked tokens.
 */
contract VestingEscrow is IVestingEscrow, OwnablePausableUpgradeable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // @dev Address of the token contract.
    IERC20 public override token;

    // @dev Address of the recipient.
    address public override recipient;

    // @dev Total amount vested.
    uint256 public override totalAmount;

    // @dev Total amount claimed.
    uint256 public override claimedAmount;

    // @dev Vesting start time.
    uint256 public override startTime;

    // @dev Vesting end time.
    uint256 public override endTime;

    // @dev Cliff length.
    uint256 public override cliffLength;

    /**
    * @dev See {IVestingEscrow-initialize}.
    */
    function initialize(
        address _admin,
        address _token,
        address _recipient,
        uint256 _totalAmount,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _cliffLength
    )
        external override initializer
    {
        __OwnablePausableUpgradeable_init(_admin);
        token = IERC20(_token);
        recipient = _recipient;
        totalAmount = _totalAmount;
        startTime = _startTime;
        endTime = _endTime;
        cliffLength = _cliffLength;
        token.safeTransferFrom(msg.sender, address(this), _totalAmount);
    }

    /**
    * @dev See {IVestingEscrow-vestedAmount}.
    */
    function vestedAmount() public view override returns (uint256) {
        uint256 _startTime = startTime;
        uint256 _endTime = endTime;
        /* solhint-disable not-rely-on-time */
        if (block.timestamp < _startTime.add(cliffLength)) return 0;
        else if (_endTime <= block.timestamp) return totalAmount;
        return totalAmount.mul(block.timestamp.sub(_startTime)).div(_endTime.sub(_startTime));
        /* solhint-disable not-rely-on-time */
    }

    /**
    * @dev See {IVestingEscrow-unclaimedAmount}.
    */
    function unclaimedAmount() public view override returns (uint256) {
        return totalAmount.sub(claimedAmount);
    }

    /**
    * @dev See {IVestingEscrow-stop}.
    */
    function stop(address beneficiary) external override onlyAdmin {
        require(beneficiary != address(0), "PoolEscrow: beneficiary is the zero address");
        uint256 _totalAmount = totalAmount;
        uint256 pulledAmount = _totalAmount.sub(claimedAmount);
        require(pulledAmount > 0, "VestingEscrow: nothing to pull");

        // solhint-disable-next-line not-rely-on-time
        endTime = block.timestamp;
        claimedAmount = _totalAmount;

        emit Stopped(msg.sender, beneficiary, pulledAmount);
        token.safeTransfer(beneficiary, pulledAmount);
    }

    /**
    * @dev See {IVestingEscrow-claim}.
    */
    function claim(address beneficiary, uint256 amount) external override whenNotPaused {
        require(beneficiary != address(0), "PoolEscrow: beneficiary is the zero address");
        require(msg.sender == recipient, "VestingEscrow: access denied");
        require(amount > 0, "VestingEscrow: amount is zero");

        uint256 _claimedAmount = claimedAmount;
        uint256 claimable = vestedAmount().sub(_claimedAmount);
        require(claimable >= amount, "VestingEscrow: invalid amount");

        claimedAmount = _claimedAmount.add(amount);
        emit Claimed(msg.sender, beneficiary, amount);
        token.safeTransfer(beneficiary, amount);
    }
}
