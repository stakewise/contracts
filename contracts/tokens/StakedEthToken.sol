// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title StakedEthToken
 *
 * @dev StakedEthToken contract stores pool staked tokens.
 */
contract StakedEthToken is IStakedEthToken, OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;

    // @dev Total amount of deposits.
    uint256 public override totalDeposits;

    // @dev Health factor displays the pool's rewards health.
    uint256 public override healthFactor;

    // @dev Amount of penalised stETH.
    uint256 public override penaltyAmount;

    // @dev Maps account address to its deposit amount.
    mapping(address => uint256) private deposits;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the BalanceReporters contract.
    address private balanceReporters;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    /**
     * @dev See {StakedEthToken-initialize}.
     */
    function initialize(address _admin, address _rewardEthToken, address _pool) public override initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init("StakeWise Staked ETH", "stETH");
        __ERC20Permit_init("StakeWise Staked ETH");
        rewardEthToken = IRewardEthToken(_rewardEthToken);
        pool = _pool;
        healthFactor = 1e18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        return totalDeposits.mul(healthFactor).div(1e18);
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account].mul(healthFactor).div(1e18);
    }

    /**
     * @dev See {IERC20-depositOf}.
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

        uint256 senderDeposit = deposits[sender];
        require(senderDeposit.mul(healthFactor).div(1e18) >= amount, "StakedEthToken: invalid amount");

        // start calculating sender rewards with updated deposit amount
        rewardEthToken.updateRewardCheckpoint(sender);
        deposits[sender] = senderDeposit.sub(amount);

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

        if (healthFactor != 1e18) {
            // adjust health factor taking into account new deposit amount
            uint256 newTotalDeposits = totalDeposits.add(amount);
            uint256 newHealthFactor = newTotalDeposits.sub(penaltyAmount).mul(1e18).div(newTotalDeposits);

            healthFactor = newHealthFactor;
            totalDeposits = newTotalDeposits;
            emit HealthFactorUpdated(newHealthFactor);
        } else {
            totalDeposits = totalDeposits.add(amount);
        }
        deposits[account] = deposits[account].add(amount);

        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev See {IRewardEthToken-updateHealthFactor}.
     */
    function updateHealthFactor(uint256 newPenaltyAmount) external override {
        require(msg.sender == balanceReporters, "StakedEthToken: permission denied");

        if (newPenaltyAmount == 0) {
            // staked amount has recovered, restore health factor
            penaltyAmount = 0;
            healthFactor = 1e18;
            emit HealthFactorUpdated(1e18);
        }

        // penalty amount has changed, update health factor
        uint256 _totalDeposits = totalDeposits;
        uint256 newHealthFactor = _totalDeposits.sub(newPenaltyAmount).mul(1e18).div(_totalDeposits);

        penaltyAmount = newPenaltyAmount;
        healthFactor = newHealthFactor;
        emit HealthFactorUpdated(newHealthFactor);
    }
}
