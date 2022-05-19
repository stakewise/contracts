// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IWhiteListManager.sol";
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

    // @dev Maps account address to its deposit amount.
    mapping(address => uint256) private deposits;

    // @dev Address of the Pool contract.
    address private pool;

    // @dev Address of the RewardEthToken contract.
    IRewardEthToken private rewardEthToken;

    // @dev The principal amount of the distributor.
    uint256 public override distributorPrincipal;

    // @dev Address of the WhiteListManager contract.
    IWhiteListManager private whiteListManager;

    /**
    * @dev See {IStakedEthToken-initialize}.
     */
    function initialize(
        address admin,
        address _pool,
        address _rewardEthToken,
        address _whiteListManager
    )
        external override initializer
    {
        require(admin != address(0), "StakedEthToken: invalid admin address");
        require(_pool != address(0), "StakedEthToken: invalid Pool address");
        require(_rewardEthToken != address(0), "StakedEthToken: invalid RewardEthToken address");

        __OwnablePausableUpgradeable_init(admin);
        __ERC20_init("Staked ETH Harbour", "sETH-h");
        __ERC20Permit_init("Staked ETH Harbour");

        pool = _pool;
        rewardEthToken = IRewardEthToken(_rewardEthToken);
        whiteListManager = IWhiteListManager(_whiteListManager);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return totalDeposits;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @dev See {IStakedEthToken-toggleRewards}.
     */
    function toggleRewards(address account, bool isDisabled) external override onlyAdmin {
        require(whiteListManager.whitelistedAccounts(account), "StakedEthToken: invalid account");

        // toggle rewards
        rewardEthToken.setRewardsDisabled(account, isDisabled);

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
        require(whiteListManager.whitelistedAccounts(sender), "StakedEthToken: invalid sender");
        require(whiteListManager.whitelistedAccounts(recipient), "StakedEthToken: invalid receiver");
        require(block.number > rewardEthToken.lastUpdateBlockNumber(), "StakedEthToken: cannot transfer during rewards update");

        // start calculating sender and recipient rewards with updated deposit amounts
        (bool senderRewardsDisabled, bool recipientRewardsDisabled) = rewardEthToken.updateRewardCheckpoints(sender, recipient);
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
     * @dev See {IStakedEthToken-mint}.
     */
    function mint(address account, uint256 amount) external override {
        require(msg.sender == pool, "StakedEthToken: access denied");

        // start calculating account rewards with updated deposit amount
        bool rewardsDisabled = rewardEthToken.updateRewardCheckpoint(account);
        if (rewardsDisabled) {
            // update merkle distributor principal if account has disabled rewards
            distributorPrincipal = distributorPrincipal.add(amount);
        }

        totalDeposits = totalDeposits.add(amount);
        deposits[account] = deposits[account].add(amount);

        emit Transfer(address(0), account, amount);
    }
}
