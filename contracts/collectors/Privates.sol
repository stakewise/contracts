pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Operators.sol";
import "../validators/IValidatorRegistration.sol";
import "../validators/ValidatorsRegistry.sol";
import "../Deposits.sol";
import "../Settings.sol";
import "./BaseCollector.sol";

/**
 * @title Privates
 *
 * Privates contract requires users to deposit the full amount required to become a Validator.
 * As soon as the Validator's deposit amount is added, the entity will be sent for the registration.
 */
contract Privates is BaseCollector {
    /**
    * Constructor for initializing the Privates contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _operators - Address of the Operators contract.
    * @param _validatorRegistration - Address of the VRC (deployed by Ethereum).
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _validatorTransfers - Address of the Validator Transfers contract.
    */
    function initialize(
        Deposits _deposits,
        Settings _settings,
        Operators _operators,
        IValidatorRegistration _validatorRegistration,
        ValidatorsRegistry _validatorsRegistry,
        ValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        BaseCollector.initialize(
            _deposits,
            _settings,
            _operators,
            _validatorRegistration,
            _validatorsRegistry,
            _validatorTransfers
        );
    }

    /**
    * Function for adding private deposits.
    * User must transfer ether amount together with calling the function.
    * The deposit amount must be the same as Validator's deposit amount.
    * The depositing will be disallowed in case `Privates` collector is paused in `Settings` contract.
    * @param _withdrawer - an account where deposit + rewards will be sent after the withdrawal.
    */
    function addDeposit(address _withdrawer) external payable {
        require(_withdrawer != address(0), "Withdrawer address cannot be zero address.");
        require(msg.value == settings.validatorDepositAmount(), "Invalid deposit amount.");
        require(!settings.pausedCollectors(address(this)), "Depositing is currently disabled.");

        // Register new deposit
        deposits.addDeposit(nextEntityId, msg.sender, _withdrawer, msg.value);
        totalSupply += msg.value;

        // Add it to the queue of ready entities
        readyEntities.push(nextEntityId);
        nextEntityId++;
    }
}
