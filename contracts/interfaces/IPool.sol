// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

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
    * @dev Returns PoolEscrow contract address.
    */
    function poolEscrow() external view returns (address);

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
    * @dev Function for transferring all GNO accumulated in Pool contract to PoolEscrow contract.
    */
    function transferToPoolEscrow() external;
}
