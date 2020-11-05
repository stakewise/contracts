// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the StakingEthToken contract.
 */
interface IStakingEthToken is IERC20 {
    /**
    * @dev Constructor for initializing the StakingEthToken contract.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _settings - address of the Settings contract.
    * @param _pool - address of the Pool contract.
    */
    function initialize(address _rewardEthToken, address _settings, address _pool) external;

    /**
    * @dev Function for retrieving the total deposits amount.
    */
    function totalDeposits() external view returns (uint256);

    /**
    * @dev Function for retrieving total deposit amount of the account.
    * @param account - address of the account to retrieve the deposit for.
    */
    function depositOf(address account) external view returns (uint256);

    /**
    * @dev Function for creating `amount` tokens and assigning them to `account`.
    * Can only be called by Pool contract.
    * @param account - address of the account to assign tokens to.
    * @param amount - amount of tokens to assign.
    */
    function mint(address account, uint256 amount) external;
}
