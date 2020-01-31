const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkValidatorRegistered,
  validatorRegistrationArgs
} = require('../utils');

const Individuals = artifacts.require('Individuals');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN('31536000');

contract(
  'Individuals',
  ([_, admin, operator, sender, withdrawer, other, ...accounts]) => {
    let networkConfig;
    let vrc;
    let validatorsRegistry;
    let individuals;

    before(async () => {
      networkConfig = await getNetworkConfig();
      await deployLogicContracts({ networkConfig });
      vrc = await deployVRC({ from: admin });
    });

    after(() => {
      removeNetworkFile(networkConfig.network);
    });

    beforeEach(async () => {
      let {
        individuals: individualsProxy,
        operators: operatorsProxy,
        validatorsRegistry: validatorsRegistryProxy,
        settings: settingsProxy
      } = await deployAllProxies({
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.options.address
      });
      individuals = await Individuals.at(individualsProxy);
      validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
      let operators = await Operators.at(operatorsProxy);
      await operators.addOperator(operator, { from: admin });

      // set staking duration
      let settings = await Settings.at(settingsProxy);
      await settings.setStakingDuration(individuals.address, stakingDuration, {
        from: admin
      });
    });

    it('fails to register Validator if there are no ready entities', async () => {
      await expectRevert(
        individuals.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
    });

    it('fails to register Validator with callers other than operator', async () => {
      await individuals.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        individuals.registerValidator(pubKey, signature, hashTreeRoot, {
          from: other
        }),
        'Permission denied.'
      );
    });

    it('fails to register Validator with used public key', async () => {
      // Register validator 1
      await individuals.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      await individuals.registerValidator(pubKey, signature, hashTreeRoot, {
        from: operator
      });

      // Register validator 2 with the same validator public key
      await individuals.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        individuals.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'Public key has been already used.'
      );
    });

    it('succeeds to register Validators for ready entities', async () => {
      const totalAmount = new BN(0);
      // Create ready entities
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        await individuals.addDeposit(withdrawer, {
          from: accounts[i],
          value: validatorDepositAmount
        });
        totalAmount.iadd(validatorDepositAmount);
      }

      // Check balance increased correctly
      await checkCollectorBalance(individuals, totalAmount);

      // Register validators
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        const { tx } = await individuals.registerValidator(
          validatorRegistrationArgs[i].pubKey,
          validatorRegistrationArgs[i].signature,
          validatorRegistrationArgs[i].hashTreeRoot,
          {
            from: operator
          }
        );
        totalAmount.isub(validatorDepositAmount);

        await checkValidatorRegistered({
          vrc,
          stakingDuration,
          transaction: tx,
          entityId: new BN(validatorRegistrationArgs.length - i),
          pubKey: validatorRegistrationArgs[i].pubKey,
          collectorAddress: individuals.address,
          validatorsRegistry: validatorsRegistry,
          signature: validatorRegistrationArgs[i].signature
        });
      }

      // Registrations are not possible anymore
      await expectRevert(
        individuals.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
      await checkCollectorBalance(individuals, new BN(0));
    });
  }
);
