// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "./IValidatorRegistration.sol";

/**
 * @dev Interface of the Pool contract.
 */
interface IPool {
    /**
    * @dev Constructor for initializing the Pool contract.
    * @param _swdToken - address of the SWDToken contract.
    * @param _settings - address of the Settings contract.
    * @param _operators - address of the Operators contract.
    * @param _validatorRegistration - address of the VRC (deployed by Ethereum).
    * @param _validators - address of the Validators contract.
    */
    function initialize(
        address _swdToken,
        address _settings,
        address _operators,
        address _validatorRegistration,
        address _validators
    ) external;

    /**
    * @dev Function for retrieving the total collected amount.
    */
    function collectedAmount() external view returns (uint256);

    /**
    * @dev Function for retrieving the validator registration contract address.
    */
    function validatorRegistration() external view returns (IValidatorRegistration);

    /**
    * @dev Function for adding deposits to the pool.
    * The depositing will be disallowed in case `Pool` contract is paused in `Settings` contract.
    */
    function addDeposit() external payable;

    /**
    * @dev Function for withdrawing deposits.
    * The deposit can only be withdrawn if there is less than `validatorDepositAmount` in the pool.
    * @param _amount - amount to withdraw.
    */
    function withdrawDeposit(uint256 _amount) external;

    /**
    * @dev Function for registering new validators.
    * @param _pubKey - BLS public key of the validator, generated by the operator.
    * @param _signature - BLS signature of the validator, generated by the operator.
    * @param _depositDataRoot - hash tree root of the deposit data, generated by the operator.
    */
    function registerValidator(bytes calldata _pubKey, bytes calldata _signature, bytes32 _depositDataRoot) external;
}