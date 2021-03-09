// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Interface of the RewardEthToken contract.
 */
interface IRewardEthToken is IERC20Upgradeable {
    /**
    * @dev Event for tracking updated maintainer.
    * @param maintainer - address of the new maintainer, where the fee will be paid.
    */
    event MaintainerUpdated(address maintainer);

    /**
    * @dev Event for tracking updated maintainer fee.
    * @param maintainerFee - new maintainer fee.
    */
    event MaintainerFeeUpdated(uint256 maintainerFee);

    /**
    * @dev Structure for storing information about user reward checkpoint.
    * @param rewardPerToken - user reward per token.
    * @param reward - user reward checkpoint.
    */
    struct Checkpoint {
        uint128 reward;
        uint128 rewardPerToken;
    }

    /**
    * @dev Event for tracking rewards update by oracles.
    * @param periodRewards - rewards since the last update.
    * @param totalRewards - total amount of rewards.
    * @param rewardPerToken - calculated reward per token for account reward calculation.
    * @param lastUpdateTimestamp - last rewards update timestamp by oracles.
    */
    event RewardsUpdated(
        uint256 periodRewards,
        uint256 totalRewards,
        uint256 rewardPerToken,
        uint256 lastUpdateTimestamp
    );

    /**
    * @dev Constructor for initializing the RewardEthToken contract.
    * @param _admin - address of the contract admin.
    * @param _stakedEthToken - address of the StakedEthToken contract.
    * @param _oracles - address of the Oracles contract.
    * @param _maintainer - maintainer's address.
    * @param _maintainerFee - maintainer's fee. Must be less than 10000 (100.00%).
    */
    function initialize(
        address _admin,
        address _stakedEthToken,
        address _oracles,
        address _maintainer,
        uint256 _maintainerFee
    ) external;

    /**
    * @dev Function for getting the address of the maintainer, where the fee will be paid.
    */
    function maintainer() external view returns (address);

    /**
    * @dev Function for changing the maintainer's address.
    * @param _newMaintainer - new maintainer's address.
    */
    function setMaintainer(address _newMaintainer) external;

    /**
    * @dev Function for getting maintainer fee. The percentage fee users pay from their reward for using the pool service.
    */
    function maintainerFee() external view returns (uint256);

    /**
    * @dev Function for changing the maintainer's fee.
    * @param _newMaintainerFee - new maintainer's fee. Must be less than 10000 (100.00%).
    */
    function setMaintainerFee(uint256 _newMaintainerFee) external;

    /**
    * @dev Function for retrieving the total rewards amount.
    */
    function totalRewards() external view returns (uint128);

    /**
    * @dev Function for retrieving the last total rewards update timestamp.
    */
    function lastUpdateTimestamp() external view returns (uint256);

    /**
    * @dev Function for retrieving current reward per token used for account reward calculation.
    */
    function rewardPerToken() external view returns (uint128);

    /**
    * @dev Function for retrieving account's current checkpoint.
    * @param account - address of the account to retrieve the checkpoint for.
    */
    function checkpoints(address account) external view returns (uint128, uint128);

    /**
    * @dev Function for updating account's reward checkpoint.
    * @param account - address of the account to update the reward checkpoint for.
    */
    function updateRewardCheckpoint(address account) external;

    /**
    * @dev Function for updating reward checkpoints for two accounts simultaneously (for gas savings).
    * @param account1 - address of the first account to update the reward checkpoint for.
    * @param account2 - address of the second account to update the reward checkpoint for.
    */
    function updateRewardCheckpoints(address account1, address account2) external;

    /**
    * @dev Function for updating validators total rewards.
    * Can only be called by Oracles contract.
    * @param newTotalRewards - new total rewards.
    */
    function updateTotalRewards(uint256 newTotalRewards) external;
}
