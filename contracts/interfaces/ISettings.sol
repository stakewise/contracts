// SPDX-License-Identifier: MIT

pragma solidity 0.5.17;

/**
 * @dev Interface of the Settings contract.
 */
interface ISettings {
    /**
    * @dev Event for tracking changed settings.
    * @param settingName - A name of the changed setting.
    */
    event SettingChanged(bytes32 settingName);

    /**
    * @dev Constructor for initializing the Settings contract.
    * @param _maintainer - An address of the maintainer, where the fee is paid.
    * @param _maintainerFee - A percentage fee for using the service.
    * @param _userDepositMinUnit - The minimal unit (wei, gwei, etc.) deposit can have.
    * @param _validatorDepositAmount - The deposit amount required to become an Ethereum validator.
    * @param _withdrawalCredentials - The withdrawal credentials.
    * @param _admins - An address of the Admins contract.
    * @param _operators - An address of the Operators contract.
    */
    function initialize(
        address payable _maintainer,
        uint16 _maintainerFee,
        uint64 _userDepositMinUnit,
        uint128 _validatorDepositAmount,
        bytes calldata _withdrawalCredentials,
        address _admins,
        address _operators
    ) external;

    /**
    * @dev Function for getting maintainer address.
    */
    function maintainer() external returns (address);

    /**
    * @dev Function for getting maintainer fee.
    */
    function maintainerFee() external returns (uint64);

    /**
    * @dev Function for getting user deposit minimal unit.
    */
    function userDepositMinUnit() external returns (uint64);

    /**
    * @dev Function for getting validator deposit amount.
    */
    function validatorDepositAmount() external returns (uint128);

    /**
    * @dev Function for getting withdrawal credentials.
    */
    function withdrawalCredentials() external returns (bytes memory);

    /**
    * @dev Function for getting staking duration of the collector contract.
    * @param _collector - The address of the collector contract.
    */
    function stakingDurations(address _collector) external returns (uint256);

    /**
    * @dev Function for checking whether the contract is paused or not.
    * @param _contract - The address of the contract to check.
    */
    function pausedContracts(address _contract) external returns (bool);

    /**
    * @dev Function for changing user's deposit minimal unit.
    * @param newValue - The new minimal deposit unit.
    */
    function setUserDepositMinUnit(uint64 newValue) external;

    /**
    * @dev Function for changing validator's deposit amount.
    * @param newValue - The new validator's deposit amount.
    */
    function setValidatorDepositAmount(uint128 newValue) external;

    /**
    * @dev Function for changing withdrawal credentials.
    * @param newValue - The new withdrawal credentials.
    */
    function setWithdrawalCredentials(bytes calldata newValue) external;

    /**
    * @dev Function for changing the maintainer's address.
    * @param newValue - The new maintainer's address.
    */
    function setMaintainer(address payable newValue) external;

    /**
    * @dev Function for changing the maintainer's fee.
    * @param newValue - The new maintainer's fee. Must be less than 10000 (100.00%).
    */
    function setMaintainerFee(uint64 newValue) external;

    /**
    * @dev Function for changing staking durations for the collectors.
    * @param collector - The address of the collector.
    * @param stakingDuration - The new staking duration of the collector.
    */
    function setStakingDuration(address collector, uint256 stakingDuration) external;

    /**
    * @dev Function for pausing or resuming managed contracts.
    * @param _contract - The address of the managed contract.
    * @param isPaused - Defines whether contract is paused or not.
    */
    function setContractPaused(address _contract, bool isPaused) external;
}
