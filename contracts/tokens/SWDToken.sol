// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "../interfaces/ISWDToken.sol";
import "../interfaces/ISWRToken.sol";
import "../interfaces/ISettings.sol";
import "./BaseERC20.sol";

/**
 * @title SWDToken
 *
 * @dev SWDToken contract stores pool deposit tokens.
 */
contract SWDToken is ISWDToken, BaseERC20 {
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

    // @dev Address of the SWRToken contract.
    ISWRToken private swrToken;

    // @dev Address of the Settings contract.
    ISettings private settings;

    /**
     * @dev See {SWDToken-initialize}.
     */
    function initialize(address _swrToken, address _settings, address _pool) public override initializer {
        super.initialize("StakeWise Deposit Token", "SWD");
        swrToken = ISWRToken(_swrToken);
        settings = ISettings(_settings);
        pool = _pool;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        int256 totalRewards = swrToken.totalRewards();
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
        int256 reward = swrToken.rewardOf(account);
        uint256 deposit = deposits[account];
        if (reward >= 0) {
            return deposit;
        }

        // in case rewards amount is negative, apply penalty to deposit
        int256 balance = deposit.toInt256().add(reward);
        return balance > 0 ? balance.toUint256() : 0;
    }

    /**
     * @dev See {ISWDToken-depositOf}.
     */
    function depositOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @dev See {BaseERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override {
        require(sender != address(0), "SWDToken: transfer from the zero address");
        require(recipient != address(0), "SWDToken: transfer to the zero address");
        require(amount > 0 && balanceOf(sender) >= amount, "SWDToken: invalid amount");
        require(!settings.pausedContracts(address(this)), "SWDToken: contract is paused");

        // start calculating sender rewards with updated deposit amount
        swrToken.updateRewardCheckpoint(sender);
        deposits[sender] = deposits[sender].sub(amount);

        // start calculating recipient rewards with updated deposit amount
        swrToken.updateRewardCheckpoint(recipient);
        deposits[recipient] = deposits[recipient].add(amount);

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {ISWDToken-mint}.
     */
    function mint(address account, uint256 amount) external override {
        require(msg.sender == pool, "SWDToken: permission denied");

        // start calculating account rewards with updated deposit amount
        swrToken.updateRewardCheckpoint(account);
        totalDeposits = totalDeposits.add(amount);
        deposits[account] = deposits[account].add(amount);

        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev See {ISWDToken-burn}.
     */
    function burn(address account, uint256 amount) external override {
        require(msg.sender == pool, "SWDToken: permission denied");
        require(balanceOf(account) >= amount, "SWDToken: burn amount exceeds balance");

        // start calculating account rewards with updated deposit amount
        swrToken.updateRewardCheckpoint(account);
        totalDeposits = totalDeposits.sub(amount);
        deposits[account] = deposits[account].sub(amount);

        emit Transfer(account, address(0), amount);
    }
}
