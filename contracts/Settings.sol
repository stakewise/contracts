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
    uint64 public maintainerFee;

    // The minimal unit (wei, gwei, etc.) deposit can have.
    uint64 public userDepositMinUnit;

    // The deposit amount required to become an Ethereum validator.
    uint128 public validatorDepositAmount;

    // The withdrawal credentials used to initiate Validator's withdrawal from the beacon chain.
    bytes public withdrawalCredentials;

    // The mapping between collector and its staking duration.
    mapping(address => uint256) public stakingDurations;

    // The mapping between the managed contract and whether it is paused or not.
    mapping(address => bool) public pausedContracts;

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
        bytes memory _withdrawalCredentials,
        Admins _admins,
        Operators _operators
    )
        public initializer
    {
        maintainer = _maintainer;
        maintainerFee = _maintainerFee;
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
    function setMaintainerFee(uint64 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");
        require(newValue < 10000, "Invalid value.");

        maintainerFee = newValue;
        emit SettingChanged("maintainerFee");
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
    * Function for pausing or resuming managed contracts.
    * @param _contract - the address of the managed contract.
    * @param isPaused - defines whether contract is paused or not.
    */
    function setContractPaused(address _contract, bool isPaused) external {
        require(admins.isAdmin(msg.sender) || operators.isOperator(msg.sender), "Permission denied.");

        pausedContracts[_contract] = isPaused;
        emit SettingChanged("pausedContracts");
    }
}
