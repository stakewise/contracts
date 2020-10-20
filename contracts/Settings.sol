// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
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
    address payable public override maintainer;

    // @dev The percentage fee users pay from their reward for using the service.
    uint64 public override maintainerFee;

    // @dev The minimum unit (wei, gwei, etc.) deposit can have.
    uint64 public override minDepositUnit;

    // @dev The deposit amount required to become an Ethereum validator.
    uint128 public override validatorDepositAmount;

    // @dev The maximum deposit amount.
    uint128 public override maxDepositAmount;

    // @dev The non-custodial validator price per month.
    uint128 public override validatorPrice;

    // @dev The withdrawal credentials used to initiate validator withdrawal from the beacon chain.
    bytes public override withdrawalCredentials;

    // @dev Defines whether all the contracts are paused.
    bool public override allContractsPaused;

    // @dev The mapping between the managed contract and whether it is paused or not.
    mapping(address => bool) private _pausedContracts;

    // @dev The mapping between the token and whether it is supported or not for payments.
    mapping(address => bool) private _supportedPaymentTokens;

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
        uint64 _minDepositUnit,
        uint128 _validatorDepositAmount,
        uint128 _maxDepositAmount,
        uint128 _validatorPrice,
        bool _allContractsPaused,
        bytes memory _withdrawalCredentials,
        address _admins,
        address _operators
    )
        public override initializer
    {
        maintainer = _maintainer;
        maintainerFee = _maintainerFee;
        minDepositUnit = _minDepositUnit;
        validatorDepositAmount = _validatorDepositAmount;
        maxDepositAmount = _maxDepositAmount;
        validatorPrice = _validatorPrice;
        allContractsPaused = _allContractsPaused;
        withdrawalCredentials = _withdrawalCredentials;
        admins = IAdmins(_admins);
        operators = IOperators(_operators);
    }

    /**
     * @dev See {ISettings-pausedContracts}.
     */
    function pausedContracts(address _contract) external view override returns (bool) {
        return allContractsPaused || _pausedContracts[_contract];
    }

    /**
     * @dev See {ISettings-supportedPaymentTokens}.
     */
    function supportedPaymentTokens(address _token) external view override returns (bool) {
        return _supportedPaymentTokens[_token];
    }

    /**
     * @dev See {ISettings-setMinDepositUnit}.
     */
    function setMinDepositUnit(uint64 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        minDepositUnit = newValue;
        emit SettingChanged("minDepositUnit");
    }

    /**
     * @dev See {ISettings-setMaxDepositAmount}.
     */
    function setMaxDepositAmount(uint128 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        maxDepositAmount = newValue;
        emit SettingChanged("maxDepositAmount");
    }

    /**
     * @dev See {ISettings-setMaintainer}.
     */
    function setMaintainer(address payable newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        maintainer = newValue;
        emit SettingChanged("maintainer");
    }

    /**
     * @dev See {ISettings-setMaintainerFee}.
     */
    function setMaintainerFee(uint64 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");
        require(newValue < 10000, "Settings: invalid value");

        maintainerFee = newValue;
        emit SettingChanged("maintainerFee");
    }

    /**
     * @dev See {ISettings-setPausedContracts}.
     */
    function setPausedContracts(address _contract, bool _isPaused) external override {
        require(admins.isAdmin(msg.sender) || operators.isOperator(msg.sender), "Settings: permission denied");

        _pausedContracts[_contract] = _isPaused;
        emit SettingChanged("pausedContracts");
    }

    /**
     * @dev See {ISettings-setSupportedPaymentTokens}.
     */
    function setSupportedPaymentTokens(address _token, bool _isSupported) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        _supportedPaymentTokens[_token] = _isSupported;
        emit PaymentTokenUpdated(_token);
    }

    /**
     * @dev See {ISettings-setAllContractsPaused}.
     */
    function setAllContractsPaused(bool paused) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        allContractsPaused = paused;
        emit SettingChanged("allContractsPaused");
    }

    /**
     * @dev See {ISettings-setValidatorPrice}.
     */
    function setValidatorPrice(uint128 _validatorPrice) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        validatorPrice = _validatorPrice;
        emit SettingChanged("validatorPrice");
    }
}
