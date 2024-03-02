// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedToken.sol";
import "../interfaces/IRewardToken.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title StakedToken
 *
 * @dev StakedToken contract stores pool staked tokens.
 */
contract StakedToken is IStakedToken, OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;

    // @dev Total amount of deposits.
    uint256 public override totalDeposits;

    // @dev Maps account address to its deposit amount.
    mapping(address => uint256) internal deposits;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the RewardToken contract.
    IRewardToken internal rewardToken;

    // @dev The principal amount of the distributor.
    uint256 public override distributorPrincipal;

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        return totalDeposits;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @dev See {IStakedToken-toggleRewards}.
     */
    function toggleRewards(address account, bool isDisabled) external override onlyAdmin {
        require(account != address(0), "StakedToken: invalid account");

        // toggle rewards
        rewardToken.setRewardsDisabled(account, isDisabled);

        // update distributor principal
        uint256 accountBalance = deposits[account];
        if (isDisabled) {
            distributorPrincipal = distributorPrincipal.add(accountBalance);
        } else {
            distributorPrincipal = distributorPrincipal.sub(accountBalance);
        }
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "StakedToken: invalid sender");
        require(recipient != address(0), "StakedToken: invalid receiver");
        require(block.number > rewardToken.lastUpdateBlockNumber(), "StakedToken: cannot transfer during rewards update");

        // start calculating sender and recipient rewards with updated deposit amounts
        (bool senderRewardsDisabled, bool recipientRewardsDisabled) = rewardToken.updateRewardCheckpoints(sender, recipient);
        if ((senderRewardsDisabled || recipientRewardsDisabled) && !(senderRewardsDisabled && recipientRewardsDisabled)) {
            // update merkle distributor principal if any of the addresses has disabled rewards
            uint256 _distributorPrincipal = distributorPrincipal; // gas savings
            if (senderRewardsDisabled) {
                _distributorPrincipal = _distributorPrincipal.sub(amount);
            } else {
                _distributorPrincipal = _distributorPrincipal.add(amount);
            }
            distributorPrincipal = _distributorPrincipal;
        }

        deposits[sender] = deposits[sender].sub(amount);
        deposits[recipient] = deposits[recipient].add(amount);

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IStakedToken-burn}.
     */
    function burn(address account, uint256 amount) external override {
        IRewardToken _rewardToken = rewardToken; // gas savings
        require(msg.sender == address(_rewardToken), "StakedToken: access denied");
        require(account != address(0), "StakedToken: invalid account");

        // start calculating account rewards with updated deposit amount
        bool rewardsDisabled = rewardToken.updateRewardCheckpoint(account);
        if (rewardsDisabled) {
            // update merkle distributor principal if account has disabled rewards
            distributorPrincipal = distributorPrincipal.sub(amount);
        }

        totalDeposits = totalDeposits.sub(amount);
        deposits[account] = deposits[account].sub(amount);

        emit Transfer(account, address(0), amount);
    }
}
