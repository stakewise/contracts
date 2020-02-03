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

const Privates = artifacts.require('Privates');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN('31536000');

contract(
  'Privates',
  ([_, admin, operator, sender, withdrawer, other, ...accounts]) => {
    let networkConfig;
    let vrc;
    let validatorsRegistry;
    let privates;

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
        privates: privatesProxy,
        operators: operatorsProxy,
        validatorsRegistry: validatorsRegistryProxy,
        settings: settingsProxy
      } = await deployAllProxies({
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.options.address
      });
      privates = await Privates.at(privatesProxy);
      validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
      let operators = await Operators.at(operatorsProxy);
      await operators.addOperator(operator, { from: admin });

      // set staking duration
      let settings = await Settings.at(settingsProxy);
      await settings.setStakingDuration(privates.address, stakingDuration, {
        from: admin
      });
    });

    it('fails to register Validator if there are no ready entities', async () => {
      await expectRevert(
        privates.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
    });

    it('fails to register Validator with callers other than operator', async () => {
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        privates.registerValidator(pubKey, signature, hashTreeRoot, {
          from: other
        }),
        'Permission denied.'
      );
    });

    it('fails to register Validator with used public key', async () => {
      // Register validator 1
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      await privates.registerValidator(pubKey, signature, hashTreeRoot, {
        from: operator
      });

      // Register validator 2 with the same validator public key
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        privates.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'Public key has been already used.'
      );
    });

    it('succeeds to register Validators for ready entities', async () => {
      const totalAmount = new BN(0);
      // Create ready entities
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        await privates.addDeposit(withdrawer, {
          from: accounts[i],
          value: validatorDepositAmount
        });
        totalAmount.iadd(validatorDepositAmount);
      }

      // Check balance increased correctly
      await checkCollectorBalance(privates, totalAmount);

      // Register validators
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        const { tx } = await privates.registerValidator(
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
          collectorAddress: privates.address,
          validatorsRegistry: validatorsRegistry,
          signature: validatorRegistrationArgs[i].signature
        });
      }

      // Registrations are not possible anymore
      await expectRevert(
        privates.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
      await checkCollectorBalance(privates, new BN(0));
    });
  }
);
