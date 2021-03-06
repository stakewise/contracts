// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "./IOwnablePausable.sol";

/**
 * @dev Interface of the Oracles contract.
 */
interface IOracles is IOwnablePausable {
    /**
    * @dev Event for tracking oracle votes.
    * @param oracle - address of the account which submitted vote.
    * @param nonce - update nonce.
    * @param totalRewards - submitted value of total rewards.
    * @param activationDuration - submitted value of activation duration.
    * @param beaconActivatingAmount - submitted value of beacon activating amount.
    */
    event VoteSubmitted(
        address indexed oracle,
        uint256 nonce,
        uint256 totalRewards,
        uint256 activationDuration,
        uint256 beaconActivatingAmount
    );

    /**
    * @dev Event for tracking changes of oracles' sync periods.
    * @param syncPeriod - new sync period.
    * @param sender - address of the transaction sender.
    */
    event SyncPeriodUpdated(uint256 syncPeriod, address indexed sender);

    /**
    * @dev Event for tracking deposits activation toggles.
    * @param enabled - defines whether deposits activation is enabled.
    * @param sender - address of the transaction sender.
    */
    event DepositsActivationToggled(bool enabled, address indexed sender);

    /**
    * @dev Function for retrieving number of votes of the submission candidate.
    * @param _candidateId - ID of the candidate to retrieve number of votes for.
    */
    function candidates(bytes32 _candidateId) external view returns (uint256);

    /**
    * @dev Function for retrieving oracles sync period.
    */
    function syncPeriod() external view returns (uint256);

    /**
    * @dev Function for retrieving whether deposits activation is enabled.
    */
    function depositsActivationEnabled() external view returns (bool);

    /**
    * @dev Function for initializing activation functionality for the Oracles contract.
    * @param _pool - address of the Pool contract.
    * @param _depositsActivationEnabled - defines whether pool deposits activation is enabled.
    */
    function initialize(address _pool, bool _depositsActivationEnabled) external;

    /**
    * @dev Function for checking whether an account has an oracle role.
    * @param _account - account to check.
    */
    function isOracle(address _account) external view returns (bool);

    /**
    * @dev Function for checking whether an oracle has voted.
    * @param _oracle - oracle address to check.
    * @param _totalRewards - voted total rewards.
    * @param _activationDuration - voted activation duration.
    * @param _beaconActivatingAmount - voted beacon activating amount.
    */
    function hasVote(
        address _oracle,
        uint256 _totalRewards,
        uint256 _activationDuration,
        uint256 _beaconActivatingAmount
    ) external view returns (bool);

    /**
    * @dev Function for retrieving current nonce.
    */
    function currentNonce() external view returns (uint256);

    /**
    * @dev Function for adding an oracle role to the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to assign an oracle role to.
    */
    function addOracle(address _account) external;

    /**
    * @dev Function for removing an oracle role from the account.
    * Can only be called by an account with an admin role.
    * @param _account - account to remove an oracle role from.
    */
    function removeOracle(address _account) external;

    /**
    * @dev Function for updating oracles sync period. The number of seconds after they will submit the off-chain data.
    * Can only be called by an account with an admin role.
    * @param _syncPeriod - new sync period.
    */
    function setSyncPeriod(uint256 _syncPeriod) external;

    /**
    * @dev Function for toggling pool deposits activation.
    * Can only be called by an account with an admin role.
    * @param _depositsActivationEnabled - defines whether pool deposits activation is enabled.
    */
    function toggleDepositsActivation(bool _depositsActivationEnabled) external;

    /**
    * @dev Function for submitting oracle vote. The last vote required for quorum will update the values.
    * Can only be called by an account with an oracle role.
    * @param _totalRewards - voted total rewards.
    * @param _activationDuration - voted activation duration.
    * @param _beaconActivatingAmount - voted beacon activating amount.
    */
    function vote(uint256 _totalRewards, uint256 _activationDuration, uint256 _beaconActivatingAmount) external;
}
