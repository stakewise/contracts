// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "./interfaces/IAdmins.sol";
import "./interfaces/IOperators.sol";
import "./interfaces/ISettings.sol";

/**
 * @title Settings
 *
 * @dev Contract for storing global settings.
 * Can be changed by accounts with an admin role.
 * Contracts can be paused by operators.
 */
contract Settings is ISettings, Initializable {
    // @dev The mapping between the setting name and its uint256 value.
    mapping(bytes32 => uint256) private uintSettings;

    // @dev The mapping between the setting name and its address value.
    mapping(bytes32 => address) private addressSettings;

    // @dev The mapping between the setting name and its bytes32 value.
    mapping(bytes32 => bytes32) private bytes32Settings;

    // @dev The mapping between the setting name and its bool value.
    mapping(bytes32 => bool) private boolSettings;

    // @dev Address of the Admins contract.
    IAdmins private admins;

    // @dev Address of the Operators contract.
    IOperators private operators;

    /**
     * @dev See {ISettings-initialize}.
     */
    function initialize(
        bool _allContractsPaused,
        uint256 _maintainerFee,
        uint256 _minDepositUnit,
        uint256 _validatorDepositAmount,
        uint256 _maxDepositAmount,
        uint256 _validatorPrice,
        address _maintainer,
        address _admins,
        address _operators,
        bytes32 _withdrawalCredentials
    )
        public override initializer
    {
        boolSettings[keccak256(abi.encodePacked("allContractsPaused"))] = _allContractsPaused;
        uintSettings[keccak256(abi.encodePacked("maintainerFee"))] = _maintainerFee;
        uintSettings[keccak256(abi.encodePacked("minDepositUnit"))] = _minDepositUnit;
        uintSettings[keccak256(abi.encodePacked("validatorDepositAmount"))] = _validatorDepositAmount;
        uintSettings[keccak256(abi.encodePacked("maxDepositAmount"))] = _maxDepositAmount;
        uintSettings[keccak256(abi.encodePacked("validatorPrice"))] = _validatorPrice;
        addressSettings[keccak256(abi.encodePacked("maintainer"))] = _maintainer;
        admins = IAdmins(_admins);
        operators = IOperators(_operators);
        bytes32Settings[keccak256(abi.encodePacked("withdrawalCredentials"))] = _withdrawalCredentials;
    }

    /**
     * @dev See {ISettings-validatorDepositAmount}.
     */
    function validatorDepositAmount() external view override returns (uint256) {
        return uintSettings[keccak256(abi.encodePacked("validatorDepositAmount"))];
    }

    /**
     * @dev See {ISettings-withdrawalCredentials}.
     */
    function withdrawalCredentials() external view override returns (bytes32) {
        return bytes32Settings[keccak256(abi.encodePacked("withdrawalCredentials"))];
    }

    /**
     * @dev See {ISettings-minDepositUnit}.
     */
    function minDepositUnit() external view override returns (uint256) {
        return uintSettings[keccak256(abi.encodePacked("minDepositUnit"))];
    }

    /**
     * @dev See {ISettings-setMinDepositUnit}.
     */
    function setMinDepositUnit(uint256 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        uintSettings[keccak256(abi.encodePacked("minDepositUnit"))] = newValue;
        emit SettingChanged("minDepositUnit");
    }

    /**
     * @dev See {ISettings-maxDepositAmount}.
     */
    function maxDepositAmount() external view override returns (uint256) {
        return uintSettings[keccak256(abi.encodePacked("maxDepositAmount"))];
    }

    /**
     * @dev See {ISettings-setMaxDepositAmount}.
     */
    function setMaxDepositAmount(uint256 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        uintSettings[keccak256(abi.encodePacked("maxDepositAmount"))] = newValue;
        emit SettingChanged("maxDepositAmount");
    }

    /**
     * @dev See {ISettings-validatorPrice}.
     */
    function validatorPrice() external view override returns (uint256) {
        return uintSettings[keccak256(abi.encodePacked("validatorPrice"))];
    }

    /**
     * @dev See {ISettings-setValidatorPrice}.
     */
    function setValidatorPrice(uint256 _validatorPrice) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        uintSettings[keccak256(abi.encodePacked("validatorPrice"))] = _validatorPrice;
        emit SettingChanged("validatorPrice");
    }

    /**
     * @dev See {ISettings-maintainer}.
     */
    function maintainer() external view override returns (address) {
        return addressSettings[keccak256(abi.encodePacked("maintainer"))];
    }

    /**
     * @dev See {ISettings-setMaintainer}.
     */
    function setMaintainer(address newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        addressSettings[keccak256(abi.encodePacked("maintainer"))] = newValue;
        emit SettingChanged("maintainer");
    }

    /**
     * @dev See {ISettings-maintainerFee}.
     */
    function maintainerFee() external view override returns (uint256) {
        return uintSettings[keccak256(abi.encodePacked("maintainerFee"))];
    }

    /**
     * @dev See {ISettings-setMaintainerFee}.
     */
    function setMaintainerFee(uint256 newValue) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");
        require(newValue < 10000, "Settings: invalid value");

        uintSettings[keccak256(abi.encodePacked("maintainerFee"))] = newValue;
        emit SettingChanged("maintainerFee");
    }

    /**
     * @dev See {ISettings-pausedContracts}.
     */
    function pausedContracts(address _contract) external view override returns (bool) {
        return allContractsPaused() || boolSettings[keccak256(abi.encodePacked("pausedContracts", _contract))];
    }

    /**
     * @dev See {ISettings-setPausedContracts}.
     */
    function setPausedContracts(address _contract, bool _isPaused) external override {
        require(admins.isAdmin(msg.sender) || operators.isOperator(msg.sender), "Settings: permission denied");

        boolSettings[keccak256(abi.encodePacked("pausedContracts", _contract))] = _isPaused;
        emit SettingChanged("pausedContracts");
    }

    /**
     * @dev See {ISettings-supportedPaymentTokens}.
     */
    function supportedPaymentTokens(address _token) external view override returns (bool) {
        return boolSettings[keccak256(abi.encodePacked("supportedPaymentTokens", _token))];
    }

    /**
     * @dev See {ISettings-setSupportedPaymentTokens}.
     */
    function setSupportedPaymentTokens(address _token, bool _isSupported) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        boolSettings[keccak256(abi.encodePacked("supportedPaymentTokens", _token))] = _isSupported;
        emit PaymentTokenUpdated(_token);
    }

    /**
     * @dev See {ISettings-allContractsPaused}.
     */
    function allContractsPaused() public view override returns (bool) {
        return boolSettings[keccak256(abi.encodePacked("allContractsPaused"))];
    }

    /**
     * @dev See {ISettings-setAllContractsPaused}.
     */
    function setAllContractsPaused(bool paused) external override {
        require(admins.isAdmin(msg.sender), "Settings: permission denied");

        boolSettings[keccak256(abi.encodePacked("allContractsPaused"))] = paused;
        emit SettingChanged("allContractsPaused");
    }
}
