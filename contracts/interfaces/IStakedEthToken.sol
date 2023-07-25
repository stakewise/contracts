// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Interface of the StakedEthToken contract.
 */
interface IStakedEthToken is IERC20Upgradeable {
    /**
    * @dev Function for retrieving the total deposits amount.
    */
    function totalDeposits() external view returns (uint256);

    /**
    * @dev Function for retrieving the principal amount of the distributor.
    */
    function distributorPrincipal() external view returns (uint256);

    /**
    * @dev Function for toggling rewards for the account.
    * @param account - address of the account.
    * @param isDisabled - whether to disable account's rewards distribution.
    */
    function toggleRewards(address account, bool isDisabled) external;

    /**
    * @dev Function for burning `amount` tokens from `account`.
    * Can only be called by RewardEthToken contract.
    * @param account - address of the account to burn tokens from.
    * @param amount - amount of tokens to burn.
    */
    function burn(address account, uint256 amount) external;
}
