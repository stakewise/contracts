// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IManagers.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IValidators.sol";


/**
 * @title Validators
 *
 * @dev Validators contract keeps track of all the registered validators and their withdrawal wallets.
 * Only collectors can register validators.
 */
contract Validators is IValidators, Initializable {
    /**
    * @dev Structure to store information about the validator.
    * @param depositAmount - validator deposit amount.
    * @param maintainerFee - fee to pay to the maintainer after withdrawal.
    * @param entityId - ID of the entity where the validator deposit was accumulated.
    * @param wallet - address where validator balance will be withdrawn.
    */
    struct Validator {
        uint256 depositAmount;
        uint256 maintainerFee;
        bytes32 entityId;
        address wallet;
    }

    // @dev Maps validator ID (hash of the public key) to the validator information.
    mapping(bytes32 => Validator) public override validators;

    // @dev Address of the wallet logical contract.
    address private walletImplementation;

    // @dev Wallet initialization data for proxy creation.
    bytes private walletInitData;

    // @dev Address of the periodic Pools contract.
    address private periodicPools;

    // @dev Address of the phase 2 Pools contract.
    address private phase2Pools;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Address of the Groups contract.
    address private groups;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Checks whether the caller is the collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == periodicPools ||
            msg.sender == phase2Pools ||
            msg.sender == groups ||
            msg.sender == solos,
            "Permission denied."
        );
        _;
    }

    /**
     * @dev See {IValidators-initialize}.
     */
    function initialize(
        address _periodicPools,
        address _phase2Pools,
        address _solos,
        address _groups,
        address _managers,
        address _settings,
        address _walletImplementation,
        bytes memory _walletInitData
    )
        public override initializer
    {
        periodicPools = _periodicPools;
        phase2Pools = _phase2Pools;
        solos = _solos;
        groups = _groups;
        managers = IManagers(_managers);
        settings = ISettings(_settings);
        walletImplementation = _walletImplementation;
        walletInitData = _walletInitData;
    }

    /**
     * @dev See {IValidators-register}.
     */
    function register(
        bytes calldata _pubKey,
        bytes calldata _withdrawalCredentials,
        bytes32 _entityId,
        uint256 _depositAmount,
        uint256 _maintainerFee
    )
        external override onlyCollectors
    {
        bytes32 validatorId = keccak256(abi.encodePacked(_pubKey));
        require(validators[validatorId].entityId == "", "Public key has been already used.");

        Validator memory validator = Validator(
            _depositAmount,
            _maintainerFee,
            _entityId,
            address(0)
        );
        validators[validatorId] = validator;
        emit ValidatorRegistered(
            validator.entityId,
            _pubKey,
            _withdrawalCredentials,
            validator.maintainerFee,
            settings.stakingDurations(msg.sender),
            validator.depositAmount
        );
    }

    /**
     * @dev See {IValidators-update}.
     */
    function update(bytes32 _validatorId, bytes32 _newEntityId, uint256 _newMaintainerFee) external override onlyCollectors {
        Validator storage validator = validators[_validatorId];
        require(validator.depositAmount == settings.validatorDepositAmount(), "Validator deposit amount cannot be updated.");
        require(validator.wallet == address(0), "Cannot update validator with assigned wallet.");

        validator.entityId = _newEntityId;
        validator.maintainerFee = _newMaintainerFee;
    }

    /**
     * @dev See {IValidators-assignWallet}.
     */
    function assignWallet(bytes32 _validatorId) external override {
        require(!settings.pausedContracts(address(this)), "Wallets assignment is currently disabled.");

        Validator storage validator = validators[_validatorId];
        require(validator.entityId != "", "Invalid validator ID.");
        require(managers.isManager(msg.sender), "Permission denied.");
        require(validator.wallet == address(0), "Validator has already wallet assigned.");

        // deploy and assign wallet to the validator
        validator.wallet = deployWallet();
        emit WalletAssigned(_validatorId, validator.wallet);
    }

    /**
    * @dev Function for creating validator wallet proxy contract.
    */
    function deployWallet() private returns (address proxy) {
        // Adapted from https://github.com/OpenZeppelin/openzeppelin-sdk/blob/v2.8.2/packages/lib/contracts/upgradeability/ProxyFactory.sol#L18
        bytes20 targetBytes = bytes20(walletImplementation);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            proxy := create(0, clone, 0x37)
        }
        if(walletInitData.length > 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = proxy.call(walletInitData);
            require(success);
        }
    }
}
