// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Interface of the StakedEthToken contract.
 */
interface IStakedEthToken is IERC20Upgradeable {
    /**
    * @dev Event for health factor updates.
    * @param healthFactor - new health factor.
    */
    event HealthFactorUpdated(uint256 healthFactor);

    /**
    * @dev Constructor for initializing the StakedEthToken contract.
    * @param _admin - address of the contract admin.
    * @param _rewardEthToken - address of the RewardEthToken contract.
    * @param _pool - address of the Pool contract.
    */
    function initialize(address _admin, address _rewardEthToken, address _pool) external;

    /**
    * @dev Function for retrieving the total deposits amount.
    */
    function totalDeposits() external view returns (uint256);

    /**
    * @dev Function for retrieving current health factor.
    */
    function healthFactor() external view returns (uint256);

    /**
    * @dev Function for retrieving current penalty amount.
    */
    function penaltyAmount() external view returns (uint256);

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

    /**
    * @dev Function for updating current health factor of staked ETH.
    * Can only be called by BalanceReporters contract.
    * @param newPenaltyAmount - penalty amount received by the pool validators fot staked ETH.
    */
    function updateHealthFactor(uint256 newPenaltyAmount) external;
}
