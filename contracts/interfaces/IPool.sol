// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "./IDepositContract.sol";
import "./IPoolValidators.sol";

/**
 * @dev Interface of the Pool contract.
 */
interface IPool {
    /**
    * @dev Event for tracking registered validators.
    * @param publicKey - validator public key.
    * @param operator - address of the validator operator.
    */
    event ValidatorRegistered(bytes publicKey, address operator);

    /**
    * @dev Event for tracking scheduled deposit activation.
    * @param sender - address of the deposit sender.
    * @param validatorIndex - index of the activated validator.
    * @param value - deposit amount to be activated.
    */
    event ActivationScheduled(address indexed sender, uint256 validatorIndex, uint256 value);

    /**
    * @dev Event for tracking activated deposits.
    * @param account - account the deposit was activated for.
    * @param validatorIndex - index of the activated validator.
    * @param value - amount activated.
    * @param sender - address of the transaction sender.
    */
    event Activated(address indexed account, uint256 validatorIndex, uint256 value, address indexed sender);

    /**
    * @dev Event for tracking activated validators updates.
    * @param activatedValidators - new total amount of activated validators.
    * @param sender - address of the transaction sender.
    */
    event ActivatedValidatorsUpdated(uint256 activatedValidators, address sender);

    /**
    * @dev Event for tracking updates to the minimal deposit amount considered for the activation period.
    * @param minActivatingDeposit - new minimal deposit amount considered for the activation.
    * @param sender - address of the transaction sender.
    */
    event MinActivatingDepositUpdated(uint256 minActivatingDeposit, address sender);

    /**
    * @dev Event for tracking pending validators limit.
    * When it's exceeded, the deposits will be set for the activation.
    * @param pendingValidatorsLimit - pending validators percent limit.
    * @param sender - address of the transaction sender.
    */
    event PendingValidatorsLimitUpdated(uint256 pendingValidatorsLimit, address sender);

    /**
    * @dev Event for tracking added deposits with partner.
    * @param partner - address of the partner.
    * @param amount - the amount added.
    */
    event StakedWithPartner(address indexed partner, uint256 amount);

    /**
    * @dev Event for tracking added deposits with referrer.
    * @param referrer - address of the referrer.
    * @param amount - the amount added.
    */
    event StakedWithReferrer(address indexed referrer, uint256 amount);

    /**
    * @dev Function for getting the total validator deposit.
    */
    // solhint-disable-next-line func-name-mixedcase
    function VALIDATOR_TOTAL_DEPOSIT() external view returns (uint256);

    /**
    * @dev Function for retrieving the total amount of pending validators.
    */
    function pendingValidators() external view returns (uint256);

    /**
    * @dev Function for retrieving the total amount of activated validators.
    */
    function activatedValidators() external view returns (uint256);

    /**
    * @dev Function for retrieving the withdrawal credentials used to
    * initiate pool validators withdrawal from the beacon chain.
    */
    function withdrawalCredentials() external view returns (bytes32);

    /**
    * @dev Function for getting the minimal deposit amount considered for the activation.
    */
    function minActivatingDeposit() external view returns (uint256);

    /**
    * @dev Function for getting the pending validators percent limit.
    * When it's exceeded, the deposits will be set for the activation.
    */
    function pendingValidatorsLimit() external view returns (uint256);

    /**
    * @dev Function for getting the amount of activating deposits.
    * @param account - address of the account to get the amount for.
    * @param validatorIndex - index of the activated validator.
    */
    function activations(address account, uint256 validatorIndex) external view returns (uint256);

    /**
    * @dev Function for setting minimal deposit amount considered for the activation period.
    * @param newMinActivatingDeposit - new minimal deposit amount considered for the activation.
    */
    function setMinActivatingDeposit(uint256 newMinActivatingDeposit) external;

    /**
    * @dev Function for changing the total amount of activated validators.
    * @param newActivatedValidators - new total amount of activated validators.
    */
    function setActivatedValidators(uint256 newActivatedValidators) external;

    /**
    * @dev Function for changing pending validators limit.
    * @param newPendingValidatorsLimit - new pending validators limit. When it's exceeded, the deposits will be set for the activation.
    */
    function setPendingValidatorsLimit(uint256 newPendingValidatorsLimit) external;

    /**
    * @dev Function for checking whether validator index can be activated.
    * @param validatorIndex - index of the validator to check.
    */
    function canActivate(uint256 validatorIndex) external view returns (bool);

    /**
    * @dev Function for retrieving the validator registration contract address.
    */
    function validatorRegistration() external view returns (IDepositContract);

    /**
    * @dev Function for receiving native tokens without minting sETH.
    */
    function receiveFees() external payable;

    /**
    * @dev Function for staking ether to the pool to the different tokens' recipient.
    * @param recipient - address of the tokens recipient.
    */
    function stakeOnBehalf(address recipient) external payable;

    /**
    * @dev Function for staking ether to the pool.
    */
    function stake() external payable;

    /**
    * @dev Function for staking ether with the partner that will receive the revenue share from the protocol fee.
    * @param partner - address of partner who will get the revenue share.
    */
    function stakeWithPartner(address partner) external payable;

    /**
    * @dev Function for staking ether with the partner that will receive the revenue share from the protocol fee
    * and the different tokens' recipient.
    * @param partner - address of partner who will get the revenue share.
    * @param recipient - address of the tokens recipient.
    */
    function stakeWithPartnerOnBehalf(address partner, address recipient) external payable;

    /**
    * @dev Function for staking ether with the referrer who will receive the one time bonus.
    * @param referrer - address of referrer who will get its referral bonus.
    */
    function stakeWithReferrer(address referrer) external payable;

    /**
    * @dev Function for staking ether with the referrer who will receive the one time bonus
    * and the different tokens' recipient.
    * @param referrer - address of referrer who will get its referral bonus.
    * @param recipient - address of the tokens recipient.
    */
    function stakeWithReferrerOnBehalf(address referrer, address recipient) external payable;

    /**
    * @dev Function for minting account's tokens for the specific validator index.
    * @param account - account address to activate the tokens for.
    * @param validatorIndex - index of the activated validator.
    */
    function activate(address account, uint256 validatorIndex) external;

    /**
    * @dev Function for minting account's tokens for the specific validator indexes.
    * @param account - account address to activate the tokens for.
    * @param validatorIndexes - list of activated validator indexes.
    */
    function activateMultiple(address account, uint256[] calldata validatorIndexes) external;

    /**
    * @dev Function for registering new pool validator registration.
    * @param depositData - the deposit data to submit for the validator.
    */
    function registerValidator(IPoolValidators.DepositData calldata depositData) external;
}
