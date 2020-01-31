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

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN(86400);

contract(
  'Pools',
  ([_, admin, operator, sender, withdrawer, other, ...accounts]) => {
    let networkConfig;
    let vrc;
    let validatorsRegistry;
    let pools;

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
        pools: poolsProxy,
        operators: operatorsProxy,
        validatorsRegistry: validatorsRegistryProxy,
        settings: settingsProxy
      } = await deployAllProxies({
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.options.address
      });
      pools = await Pools.at(poolsProxy);
      validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
      let operators = await Operators.at(operatorsProxy);
      await operators.addOperator(operator, { from: admin });

      // set staking duration
      let settings = await Settings.at(settingsProxy);
      await settings.setStakingDuration(pools.address, stakingDuration, {
        from: admin
      });
    });

    it('fails to register Validator if there are no ready pools', async () => {
      await expectRevert(
        pools.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
    });

    it('fails to register Validator for callers other than operator', async () => {
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        pools.registerValidator(pubKey, signature, hashTreeRoot, {
          from: other
        }),
        'Permission denied.'
      );
    });

    it('fails to register Validator with used public key', async () => {
      // Register validator 1
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      await pools.registerValidator(pubKey, signature, hashTreeRoot, {
        from: operator
      });

      // Register validator 2 with the same validator public key
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        pools.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'Public key has been already used.'
      );
    });

    it('succeeds to register Validators for ready pools', async () => {
      const totalAmount = new BN(0);
      // Create ready pools
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        await pools.addDeposit(withdrawer, {
          from: accounts[i],
          value: validatorDepositAmount
        });
        totalAmount.iadd(validatorDepositAmount);
      }

      // Register validators
      for (let i = 0; i < validatorRegistrationArgs.length; i++) {
        const { tx } = await pools.registerValidator(
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
          collectorAddress: pools.address,
          validatorsRegistry: validatorsRegistry,
          signature: validatorRegistrationArgs[i].signature
        });
      }

      // Registrations are not possible anymore
      await expectRevert(
        pools.registerValidator(pubKey, signature, hashTreeRoot, {
          from: operator
        }),
        'There are no ready entities.'
      );
      await checkCollectorBalance(pools, new BN(0));
    });
  }
);
