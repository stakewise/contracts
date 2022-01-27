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
    * @dev Event for tracking refunds.
    * @param sender - address of the refund sender.
    * @param amount - refunded amount.
    */
    event Refunded(address indexed sender, uint256 amount);

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
    * @dev Function for initializing the Pool contract.
    * @param admin - address of the contract admin.
    * @param _withdrawalCredentials - withdrawal credentials for the pool validators.
    * @param _validatorRegistration - address of the ValidatorRegistration contract.
    * @param _stakedToken - address of the StakedToken contract.
    * @param _validators - address of the Validators contract.
    * @param _oracles - address of the Oracles contract.
    * @param _minActivatingDeposit - minimal deposit amount considered for the activation.
    * @param _pendingValidatorsLimit - pending validators limit. When it's exceeded, the deposits will be set for the activation.
    */
    function initialize(
        address admin,
        bytes32 _withdrawalCredentials,
        address _validatorRegistration,
        address _stakedToken,
        address _validators,
        address _oracles,
        uint256 _minActivatingDeposit,
        uint256 _pendingValidatorsLimit
    ) external;

    /**
    * @dev Function for getting the total validator deposit.
    */
    // solhint-disable-next-line func-name-mixedcase
    function VALIDATOR_TOTAL_DEPOSIT() external view returns (uint256);

    /**
    * @dev Function for getting the address of mGNO <-> GNO wrapper.
    */
    // solhint-disable-next-line func-name-mixedcase
    function MGNO_WRAPPER() external view returns (address);

    /**
    * @dev Function for getting the address of GNO token.
    */
    // solhint-disable-next-line func-name-mixedcase
    function GNO_TOKEN() external view returns (address);

    /**
    * @dev Function for getting the address of mGNO token.
    */
    // solhint-disable-next-line func-name-mixedcase
    function MGNO_TOKEN() external view returns (address);

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
    * @dev Function for calculating mGNO amount for the GNO input.
    * @param amountIn - GNO tokens amount.
    */
    function calculateMGNO(uint256 amountIn) external view returns (uint256);

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
    * @dev Function for staking GNO tokens to the pool. The tokens will be converted to mGNO and then staked.
    * @param amount - the amount of tokens to stake.
    * @param recipient - address of the staked mGNO tokens recipient. Can be zero if should be the sender.
    * @param referredBy - address of the referrer. Can be zero if not referred by anyone.
    * @param hasRevenueShare - defines whether referrer participates in revenue sharing.
    */
    function stakeGNO(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare
    ) external;

    /**
    * @dev Function for staking GNO tokens to the pool with permit call. The tokens will be converted to mGNO and then staked.
    * @param amount - the amount of tokens to stake.
    * @param recipient - address of the staked mGNO tokens recipient. Can be zero if should be the sender.
    * @param referredBy - address of the referrer. Can be zero if not referred by anyone.
    * @param hasRevenueShare - defines whether referrer participates in revenue sharing.
    * @param nonce - The nonce taken from `nonces(_holder)` public getter.
    * @param expiry - The allowance expiration date (unix timestamp in UTC). Can be zero for no expiration.
    * @param v - A final byte of signature (ECDSA component).
    * @param r - The first 32 bytes of signature (ECDSA component).
    * @param s - The second 32 bytes of signature (ECDSA component).
    */
    function stakeGNOWithPermit(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
    * @dev Function for staking mGNO tokens to the pool.
    * @param amount - the amount of tokens to stake.
    * @param recipient - address of the staked mGNO tokens recipient. Can be zero if should be the sender.
    * @param referredBy - address of the referrer. Can be zero if not referred by anyone.
    * @param hasRevenueShare - defines whether referrer participates in revenue sharing.
    */
    function stakeMGNO(
        uint256 amount,
        address recipient,
        address referredBy,
        bool hasRevenueShare
    ) external;

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

    /**
    * @dev Function for refunding to the pool.
    * Can only be executed by the account with admin role.
    * @param amount - the amount of mGNO tokens to refund.
    */
    function refund(uint256 amount) external;
}
