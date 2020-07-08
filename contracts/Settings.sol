pragma solidity 0.5.17;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./interfaces/IAdmins.sol";
import "./interfaces/IOperators.sol";
import "./interfaces/ISettings.sol";

/**
 * @title Settings
 *
 * @dev Contract for storing global settings.
 * Can mostly be changed by accounts with an admin role.
 */
contract Settings is ISettings, Initializable {
    // @dev The address of the application owner, where the fee will be paid.
    address payable public maintainer;

    // @dev The percentage fee users pay from their reward for using the service.
    uint64 public maintainerFee;

    // @dev The minimal unit (wei, gwei, etc.) deposit can have.
    uint64 public userDepositMinUnit;

    // @dev The deposit amount required to become an Ethereum validator.
    uint128 public validatorDepositAmount;

    // @dev The withdrawal credentials used to initiate validator withdrawal from the beacon chain.
    bytes public withdrawalCredentials;

    /**
     * @dev See {ISettings-stakingDurations}.
     */
    mapping(address => uint256) public stakingDurations;

    /**
     * @dev See {ISettings-pausedContracts}.
     */
    mapping(address => bool) public pausedContracts;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the Operators contract.
    IOperators private operators;

    /**
     * @dev See {ISettings-initialize}.
     */
    function initialize(
        address payable _maintainer,
        uint16 _maintainerFee,
        uint64 _userDepositMinUnit,
        uint128 _validatorDepositAmount,
        bytes memory _withdrawalCredentials,
        address _admins,
        address _operators
    )
        public initializer
    {
        maintainer = _maintainer;
        maintainerFee = _maintainerFee;
        userDepositMinUnit = _userDepositMinUnit;
        validatorDepositAmount = _validatorDepositAmount;
        withdrawalCredentials = _withdrawalCredentials;
        admins = IAdmins(_admins);
        operators = IOperators(_operators);
    }

    /**
     * @dev See {ISettings-setUserDepositMinUnit}.
     */
    function setUserDepositMinUnit(uint64 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        userDepositMinUnit = newValue;
        emit SettingChanged("userDepositMinUnit");
    }

    /**
     * @dev See {ISettings-setValidatorDepositAmount}.
     */
    function setValidatorDepositAmount(uint128 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        validatorDepositAmount = newValue;
        emit SettingChanged("validatorDepositAmount");
    }

    /**
     * @dev See {ISettings-setWithdrawalCredentials}.
     */
    function setWithdrawalCredentials(bytes calldata newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        withdrawalCredentials = newValue;
        emit SettingChanged("withdrawalCredentials");
    }

    /**
     * @dev See {ISettings-setMaintainer}.
     */
    function setMaintainer(address payable newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        maintainer = newValue;
        emit SettingChanged("maintainer");
    }

    /**
     * @dev See {ISettings-setMaintainerFee}.
     */
    function setMaintainerFee(uint64 newValue) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");
        require(newValue < 10000, "Invalid value.");

        maintainerFee = newValue;
        emit SettingChanged("maintainerFee");
    }

    /**
     * @dev See {ISettings-setStakingDuration}.
     */
    function setStakingDuration(address collector, uint256 stakingDuration) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        stakingDurations[collector] = stakingDuration;
        emit SettingChanged("stakingDurations");
    }

    /**
     * @dev See {ISettings-setContractPaused}.
     */
    function setContractPaused(address _contract, bool isPaused) external {
        require(admins.isAdmin(msg.sender) || operators.isOperator(msg.sender), "Permission denied.");

        pausedContracts[_contract] = isPaused;
        emit SettingChanged("pausedContracts");
    }
}
