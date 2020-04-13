pragma solidity 0.5.17;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./access/Admins.sol";
import "./access/Operators.sol";

/**
 * @title Settings
 * Contract for storing global settings.
 * Can only be changed by accounts with an admin role.
 */
contract Settings is Initializable {
    // The address of the application owner, where the fee will be paid.
    address payable public maintainer;

    // The percentage fee users pay from their reward for using the service.
    uint16 public maintainerFee;

    // The minimal staking duration of the Validator.
    uint48 public minStakingDuration;

    // The minimal unit (wei, gwei, etc.) deposit can have.
    uint64 public userDepositMinUnit;

    // The deposit amount required to become an Ethereum validator.
    uint128 public validatorDepositAmount;

    // The withdrawal credentials used to initiate Validator's withdrawal from the beacon chain.
    bytes public withdrawalCredentials;

    // The mapping between collector and its staking duration.
    mapping(address => uint256) public stakingDurations;

    // The mapping between collector and whether its new entities creation is paused or not.
    mapping(address => bool) public pausedCollectors;

    // Address of the Admins contract.
    Admins private admins;

    // Address of the Operators contract.
    Operators private operators;

    /**
    * Event for tracking changed settings.
    * @param settingName - A name of the changed setting.
    */
    event SettingChanged(bytes32 settingName);

    /**
    * Constructor for initializing the Settings contract.
    * @param _maintainer - An address of the maintainer, where the fee is paid.
    * @param _maintainerFee - A percentage fee for using the service.
    * @param _minStakingDuration - The minimal staking duration of the Validator.
    * @param _userDepositMinUnit - The minimal unit (wei, gwei, etc.) deposit can have.
    * @param _validatorDepositAmount - The deposit amount required to become an Ethereum validator.
    * @param _withdrawalCredentials - The withdrawal credentials.
    * @param _admins - An address of the Admins contract.
    * @param _operators - An address of the Operators contract.
    */
    function initialize(
        address payable _maintainer,
        uint16 _maintainerFee,
        uint48 _minStakingDuration,
        uint64 _userDepositMinUnit,
        uint128 _validatorDepositAmount,
        bytes memory _withdrawalCredentials,
        Admins _admins,
        Operators _operators
    )
        public initializer
    {
        maintainer = _maintainer;
        maintainerFee = _maintainerFee;
        minStakingDuration = _minStakingDuration;
        userDepositMinUnit = _userDepositMinUnit;
        validatorDepositAmount = _validatorDepositAmount;
        withdrawalCredentials = _withdrawalCredentials;
        admins = _admins;
        operators = _operators;
    }

    /**
    * Function for changing user's deposit minimal unit.
    * @param newValue - the new minimal deposit unit.
    */
    function setUserDepositMinUnit(uint64 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        userDepositMinUnit = newValue;
        emit SettingChanged("userDepositMinUnit");
    }

    /**
    * Function for changing validator's deposit amount.
    * @param newValue - the new validator's deposit amount.
    */
    function setValidatorDepositAmount(uint128 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        validatorDepositAmount = newValue;
        emit SettingChanged("validatorDepositAmount");
    }

    /**
    * Function for changing withdrawal credentials.
    * @param newValue - the new withdrawal credentials.
    */
    function setWithdrawalCredentials(bytes calldata newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        withdrawalCredentials = newValue;
        emit SettingChanged("withdrawalCredentials");
    }

    /**
    * Function for changing the maintainer's address.
    * @param newValue - the new maintainer's address.
    */
    function setMaintainer(address payable newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        maintainer = newValue;
        emit SettingChanged("maintainer");
    }

    /**
    * Function for changing the maintainer's fee.
    * @param newValue - the new maintainer's fee. Must be less than 10000 (100.00%).
    */
    function setMaintainerFee(uint16 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");
        require(newValue < 10000, "Invalid value.");

        maintainerFee = newValue;
        emit SettingChanged("maintainerFee");
    }

    /**
    * Function for changing Validator's minimal staking duration.
    * @param newValue - new minimal duration.
    */
    function setMinStakingDuration(uint48 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        minStakingDuration = newValue;
        emit SettingChanged("minStakingDuration");
    }

    /**
    * Function for changing staking durations for the collectors.
    * @param collector - the address of the collector.
    * @param stakingDuration - the new staking duration of the collector.
    */
    function setStakingDuration(address collector, uint256 stakingDuration) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        stakingDurations[collector] = stakingDuration;
        emit SettingChanged("stakingDurations");
    }

    /**
    * Function for pausing or resuming collector deposits.
    * @param collector - the address of the collector.
    * @param isPaused - defines whether collector is paused or not.
    */
    function setCollectorPaused(address collector, bool isPaused) external {
        require(admins.isAdmin(msg.sender) || operators.isOperator(msg.sender), "Permission denied.");

        pausedCollectors[collector] = isPaused;
        emit SettingChanged("pausedCollectors");
    }
}
