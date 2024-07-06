// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../interfaces/IRewardToken.sol";
import "../tokens/StakedToken.sol";

/**
 * @title StakedTokenMock
 *
 * @dev StakedTokenMock contract is used for testing the StakedToken contract.
 */
contract StakedTokenMock is StakedToken {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public immutable poolEscrow;
    address public immutable gnoToken;

    constructor(address _poolEscrow, address _gnoToken) {
        poolEscrow = _poolEscrow;
        gnoToken = _gnoToken;
    }

    /**
     * @dev Initializes the contract.
     *
     * @param _name Name of the token.
     * @param _symbol Symbol of the token.
     * @param _admin Address of the admin.
     * @param _rewardToken Address of the RewardToken contract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _admin,
        address _rewardToken
    ) external initializer {
        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __OwnablePausableUpgradeable_init(_admin);
        rewardToken = IRewardToken(_rewardToken);
    }

    function mint(uint256 amount) external onlyAdmin {
        IERC20Upgradeable(gnoToken).safeTransferFrom(msg.sender, poolEscrow, amount);

        // start calculating account rewards with updated deposit amount
        bool rewardsDisabled = rewardToken.updateRewardCheckpoint(msg.sender);
        if (rewardsDisabled) {
            // update merkle distributor principal if account has disabled rewards
            distributorPrincipal = distributorPrincipal.add(amount);
        }

        totalDeposits = totalDeposits.add(amount);
        deposits[msg.sender] = deposits[msg.sender].add(amount);

        emit Transfer(address(0), msg.sender, amount);
    }
}
