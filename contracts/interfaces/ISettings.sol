// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

/**
 * @dev Interface of the Settings contract.
 */
interface ISettings {
    /**
    * @dev Event for tracking changed settings.
    * @param settingName - name of the changed setting.
    */
    event SettingChanged(bytes32 settingName);

    /**
    * @dev Constructor for initializing the Settings contract.
    * @param _maintainer - address of the maintainer, where the fee is paid.
    * @param _maintainerFee - percentage fee for using the service.
    * @param _userDepositMinUnit - minimal unit (wei, gwei, etc.) deposit can have.
    * @param _validatorDepositAmount - deposit amount required to become an Ethereum validator.
    * @param _validatorPrice - price per second of the non-custodial validator.
    * @param _withdrawalCredentials - withdrawal credentials.
    * @param _admins - address of the Admins contract.
    * @param _operators - address of the Operators contract.
    */
    function initialize(
        address payable _maintainer,
        uint16 _maintainerFee,
        uint64 _userDepositMinUnit,
        uint128 _validatorDepositAmount,
        uint256 _validatorPrice,
        bytes memory _withdrawalCredentials,
        address _admins,
        address _operators
    ) external;

    /**
    * @dev Function for getting maintainer address.
    */
    function maintainer() external view returns (address payable);

    /**
    * @dev Function for getting maintainer fee.
    */
    function maintainerFee() external view returns (uint64);

    /**
    * @dev Function for getting user deposit minimal unit.
    */
    function userDepositMinUnit() external view returns (uint64);

    /**
    * @dev Function for getting validator deposit amount.
    */
    function validatorDepositAmount() external view returns (uint128);

    /**
    * @dev Function for getting non-custodial validator price.
    */
    function validatorPrice() external view returns (uint256);

    /**
    * @dev Function for getting withdrawal credentials.
    */
    function withdrawalCredentials() external view returns (bytes memory);

    /**
    * @dev Function for getting staking duration of the collector contract.
    * @param _collector - address of the collector contract.
    */
    function stakingDurations(address _collector) external view returns (uint256);

    /**
    * @dev Function for checking whether the contract is paused or not.
    * @param _contract - address of the contract to check.
    */
    function pausedContracts(address _contract) external view returns (bool);

    /**
    * @dev Function for changing user's deposit minimal unit.
    * @param newValue - new minimal deposit unit.
    */
    function setUserDepositMinUnit(uint64 newValue) external;

    /**
    * @dev Function for changing validator's deposit amount.
    * @param newValue - new validator's deposit amount.
    */
    function setValidatorDepositAmount(uint128 newValue) external;

    /**
    * @dev Function for changing withdrawal credentials.
    * @param newValue - new withdrawal credentials.
    */
    function setWithdrawalCredentials(bytes calldata newValue) external;

    /**
    * @dev Function for changing the maintainer's address.
    * @param newValue - new maintainer's address.
    */
    function setMaintainer(address payable newValue) external;

    /**
    * @dev Function for changing the maintainer's fee.
    * @param newValue - new maintainer's fee. Must be less than 10000 (100.00%).
    */
    function setMaintainerFee(uint64 newValue) external;

    /**
    * @dev Function for changing staking durations for the collectors.
    * @param collector - address of the collector.
    * @param stakingDuration - new staking duration of the collector.
    */
    function setStakingDuration(address collector, uint256 stakingDuration) external;

    /**
    * @dev Function for pausing or resuming managed contracts.
    * @param _contract - address of the managed contract.
    * @param isPaused - defines whether contract is paused or not.
    */
    function setContractPaused(address _contract, bool isPaused) external;

    /**
    * @dev Function for setting non-custodial validator price.
    * @param _validatorPrice - new validator price.
    */
    function setValidatorPrice(uint256 _validatorPrice) external;
}
