// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "./ERC20.sol";

/**
 * @title StakedEthToken
 *
 * @dev StakedEthToken contract stores pool staked tokens.
 */
contract StakedEthToken is IStakedEthToken, OwnablePausableUpgradeable, ERC20 {
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using SafeCastUpgradeable for int256;

    // @dev Total amount of deposits.
    uint256 public override totalDeposits;

    // @dev Maps account address to its deposit amount.
    mapping(address => uint256) private deposits;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    /**
     * @dev See {StakedEthToken-initialize}.
     */
    function initialize(address _admin, address _rewardEthToken, address _pool) public override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init_unchained("StakeWise Staked ETH", "stETH");
        rewardEthToken = IRewardEthToken(_rewardEthToken);
        pool = _pool;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        int256 totalRewards = int256(rewardEthToken.totalRewards());
        if (totalRewards >= 0) {
            return totalDeposits;
        }

        // in case rewards amount is negative, apply penalty to deposits
        int256 _totalSupply = totalDeposits.toInt256().add(totalRewards);
        return _totalSupply > 0 ? _totalSupply.toUint256() : 0;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        int256 reward = int256(rewardEthToken.rewardOf(account));
        uint256 deposit = deposits[account];
        if (reward >= 0) {
            return deposit;
        }

        // rewards amount is negative, apply penalty to deposit
        // the penalty cannot be bigger than the deposit
        return deposit.toInt256().add(reward).toUint256();
    }

    /**
     * @dev See {IStakedEthToken-depositOf}.
     */
    function depositOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "StakedEthToken: transfer from the zero address");
        require(recipient != address(0), "StakedEthToken: transfer to the zero address");

        uint256 newSenderDeposit = deposits[sender].sub(amount, "StakedEthToken: invalid amount");
        int256 senderReward = int256(rewardEthToken.rewardOf(sender));
        require(
            senderReward >= 0 || newSenderDeposit.toInt256().add(senderReward.mul(2)) > 0,
            "StakedEthToken: unsafe penalty for left sender stETH amount"
        );

        // start calculating sender rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(sender);
        deposits[sender] = newSenderDeposit;

        // start calculating recipient rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(recipient);
        deposits[recipient] = deposits[recipient].add(amount);

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IStakedEthToken-mint}.
     */
    function mint(address account, uint256 amount) external override {
        require(msg.sender == pool, "StakedEthToken: permission denied");

        // start calculating account rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(account);
        totalDeposits = totalDeposits.add(amount);
        deposits[account] = deposits[account].add(amount);

        emit Transfer(address(0), account, amount);
    }
}
