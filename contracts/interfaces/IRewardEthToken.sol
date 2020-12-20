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
        uint256 rewardPerToken;
        uint256 reward;
    }

    /**
    * @dev Event for tracking rewards update by balance reporters.
    * @param periodRewards - rewards since the last update.
    * @param totalRewards - total amount of rewards.
    * @param rewardPerToken - calculated reward per token for account reward calculation.
    * @param updateTimestamp - last rewards update timestamp by balance reporters.
    */
    event RewardsUpdated(
        uint256 periodRewards,
        uint256 totalRewards,
        uint256 rewardPerToken,
        uint256 updateTimestamp
    );

    /**
    * @dev Constructor for initializing the RewardEthToken contract.
    * @param _admin - address of the contract admin.
    * @param _stakedEthToken - address of the StakedEthToken contract.
    * @param _balanceReporters - address of the BalanceReporters contract.
    * @param _stakedTokens - address of the StakedTokens contract.
    * @param _maintainer - maintainer's address.
    * @param _maintainerFee - maintainer's fee. Must be less than 10000 (100.00%).
    */
    function initialize(
        address _admin,
        address _stakedEthToken,
        address _balanceReporters,
        address _stakedTokens,
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
    * @dev Function for retrieving the last total rewards update timestamp.
    */
    function updateTimestamp() external view returns (uint256);

    /**
    * @dev Function for retrieving the total rewards amount.
    */
    function totalRewards() external view returns (uint256);

    /**
    * @dev Function for retrieving current reward per token used for account reward calculation.
    */
    function rewardPerToken() external view returns (uint256);

    /**
    * @dev Function for retrieving account's current checkpoint.
    * @param account - address of the account to retrieve the checkpoint for.
    */
    function checkpoints(address account) external view returns (uint256, uint256);

    /**
    * @dev Function for updating account's reward checkpoint.
    * @param account - address of the account to update the reward checkpoint for.
    */
    function updateRewardCheckpoint(address account) external;

    /**
    * @dev Function for updating validators total rewards.
    * Can only be called by Balance Reporters contract.
    * @param newTotalRewards - new total rewards.
    */
    function updateTotalRewards(uint256 newTotalRewards) external;

    /**
    * @dev Function for claiming rewards. Can only be called by StakedTokens contract.
    * @param tokenContract - address of the token contract.
    * @param claimedRewards - total rewards to claim.
    */
    function claimRewards(address tokenContract, uint256 claimedRewards) external;
}
