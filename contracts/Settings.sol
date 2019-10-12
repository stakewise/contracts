pragma solidity 0.5.12;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";

/**
 * @title Settings
 * Contract for storing global settings.
 * Can only be changed by accounts with the admin role.
 */
contract Settings is Initializable {
    // The address of the application owner, where the fee will be paid.
    address payable public maintainer;

    // The percentage fee users pay from their income for using the service.
    uint16 public maintainerFee;

    // The minimal unit (wei, gwei, etc.) deposit can have.
    uint64 public userDepositMinUnit;

    // The deposit amount required to become an Ethereum validator.
    uint128 public validatorDepositAmount;

    // The withdrawal credentials used to initiate the validator withdrawal from the beacon chain.
    bytes public withdrawalCredentials;

    // Address of the Admins contract.
    Admins private admins;

    /**
    * Event for tracking changed settings.
    * @param settingName - A name of the changed setting.
    */
    event SettingChanged(bytes32 indexed settingName);

    /**
    * Constructor for initializing the Settings contract.
    * @param _maintainer - An address of the maintainer, where the fee is paid.
    * @param _maintainerFee - A percentage fee for using the service.
    * @param _userDepositMinUnit - The minimal unit (wei, gwei, etc.) deposit can have.
    * @param _validatorDepositAmount - The deposit amount required to become an Ethereum validator.
    * @param _withdrawalCredentials - The withdrawal credentials.
    * @param _admins - An address of the Admins contract.
    */
    function initialize(
        address payable _maintainer,
        uint16 _maintainerFee,
        uint64 _userDepositMinUnit,
        uint128 _validatorDepositAmount,
        bytes memory _withdrawalCredentials,
        Admins _admins
    )
        public initializer
    {
        maintainer = _maintainer;
        maintainerFee = _maintainerFee;
        userDepositMinUnit = _userDepositMinUnit;
        validatorDepositAmount = _validatorDepositAmount;
        withdrawalCredentials = _withdrawalCredentials;
        admins = _admins;
    }

    /**
    * Function for changing user's deposit minimal unit.
    * @param newValue - the new minimal deposit unit.
    */
    function setUserDepositMinUnit(uint64 newValue) external {
        require(admins.isAdmin(msg.sender), "Only admin users can change this parameter.");

        userDepositMinUnit = newValue;
        emit SettingChanged("userDepositMinUnit");
    }

    /**
    * Function for changing validator's deposit amount.
    * @param newValue - the new validator's deposit amount.
    */
    function setValidatorDepositAmount(uint128 newValue) external {
        require(admins.isAdmin(msg.sender), "Only admin users can change this parameter.");

        validatorDepositAmount = newValue;
        emit SettingChanged("validatorDepositAmount");
    }

    /**
    * Function for changing withdrawal credentials.
    * @param newValue - the new withdrawal credentials.
    */
    function setWithdrawalCredentials(bytes calldata newValue) external {
        require(admins.isAdmin(msg.sender), "Only admin users can change this parameter.");

        withdrawalCredentials = newValue;
        emit SettingChanged("withdrawalCredentials");
    }

    /**
    * Function for changing the maintainer's address.
    * @param newValue - the new maintainer's address.
    */
    function setMaintainer(address payable newValue) external {
        require(admins.isAdmin(msg.sender), "Only admin users can change this parameter.");

        maintainer = newValue;
        emit SettingChanged("maintainer");
    }

    /**
    * Function for changing the maintainer's fee.
    * @param newValue - the new maintainer's fee. Must be less than 10000 (100.00%).
    */
    function setMaintainerFee(uint16 newValue) external {
        require(admins.isAdmin(msg.sender), "Only admin users can change this parameter.");
        require(newValue < 10000, "Invalid value.");

        maintainerFee = newValue;
        emit SettingChanged("maintainerFee");
    }
}
