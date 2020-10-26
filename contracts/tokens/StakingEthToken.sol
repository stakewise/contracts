// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "../interfaces/IStakingEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/ISettings.sol";
import "./BaseERC20.sol";

/**
 * @title StakingEthToken
 *
 * @dev StakingEthToken contract stores pool staking tokens.
 */
contract StakingEthToken is IStakingEthToken, BaseERC20 {
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;

    // @dev Total amount of deposits.
    uint256 public override totalDeposits;

    // @dev Maps account address to its deposit amount.
    mapping(address => uint256) private deposits;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev Address of the Settings contract.
    ISettings private settings;

    /**
     * @dev See {StakingEthToken-initialize}.
     */
    function initialize(address _rewardEthToken, address _settings, address _pool) public override initializer {
        super.initialize("StakeWise Staking ETH", "stETH");
        rewardEthToken = IRewardEthToken(_rewardEthToken);
        settings = ISettings(_settings);
        pool = _pool;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        int256 totalRewards = rewardEthToken.totalRewards();
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
    function balanceOf(address account) public view override returns (uint256) {
        int256 reward = rewardEthToken.rewardOf(account);
        uint256 deposit = deposits[account];
        if (reward >= 0) {
            return deposit;
        }

        // in case rewards amount is negative, apply penalty to deposit
        int256 balance = deposit.toInt256().add(reward);
        return balance > 0 ? balance.toUint256() : 0;
    }

    /**
     * @dev See {IStakingEthToken-depositOf}.
     */
    function depositOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @dev See {BaseERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override {
        require(sender != address(0), "StakingEthToken: transfer from the zero address");
        require(recipient != address(0), "StakingEthToken: transfer to the zero address");
        require(amount > 0 && balanceOf(sender) >= amount, "StakingEthToken: invalid amount");
        require(!settings.pausedContracts(address(this)), "StakingEthToken: contract is paused");

        // start calculating sender rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(sender);
        deposits[sender] = deposits[sender].sub(amount);

        // start calculating recipient rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(recipient);
        deposits[recipient] = deposits[recipient].add(amount);

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IStakingEthToken-mint}.
     */
    function mint(address account, uint256 amount) external override {
        require(msg.sender == pool, "StakingEthToken: permission denied");

        // start calculating account rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(account);
        totalDeposits = totalDeposits.add(amount);
        deposits[account] = deposits[account].add(amount);

        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev See {IStakingEthToken-burn}.
     */
    function burn(address account, uint256 amount) external override {
        require(msg.sender == pool, "StakingEthToken: permission denied");
        require(balanceOf(account) >= amount, "StakingEthToken: burn amount exceeds balance");

        // start calculating account rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(account);
        totalDeposits = totalDeposits.sub(amount);
        deposits[account] = deposits[account].sub(amount);

        emit Transfer(account, address(0), amount);
    }
}
