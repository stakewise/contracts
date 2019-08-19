const { BN, expectRevert } = require('openzeppelin-test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  POOLS_ENTITY_PREFIX,
  removeNetworkFile,
  checkCollectorBalance,
  checkValidatorRegistered,
  getEntityId
} = require('../utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

// Validator Registration Contract arguments
const pubKey = web3.utils.fromAscii('\x11'.repeat(48));
const signature = web3.utils.fromAscii('\x33'.repeat(96));

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
      vrc = await deployVRC(admin);
    });

    after(() => {
      removeNetworkFile(networkConfig.network);
    });

    beforeEach(async () => {
      let {
        pools: poolsProxy,
        operators: operatorsProxy,
        validatorsRegistry: validatorsRegistryProxy
      } = await deployAllProxies({
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.address
      });
      pools = await Pools.at(poolsProxy);
      validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
      let operators = await Operators.at(operatorsProxy);
      await operators.addOperator(operator, { from: admin });
    });

    it('fails to register Validator if there are no ready pools', async () => {
      await expectRevert(
        pools.registerValidator(pubKey, signature, {
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
        pools.registerValidator(pubKey, signature, {
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

      await pools.registerValidator(pubKey, signature, {
        from: operator
      });

      // Register validator 2 with the same validator public key
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });
      await expectRevert(
        pools.registerValidator(pubKey, signature, {
          from: operator
        }),
        'Public key has been already used.'
      );
    });

    it('succeeds to register Validators for ready pools', async () => {
      const totalAmount = new BN(0);
      // Create 4 ready pools
      for (let i = 0; i < 4; i++) {
        await pools.addDeposit(withdrawer, {
          from: accounts[i],
          value: validatorDepositAmount
        });
        totalAmount.iadd(validatorDepositAmount);
      }

      // Register 4 validators
      const pubKeys = [
        web3.utils.fromAscii('\x12'.repeat(48)),
        web3.utils.fromAscii('\x13'.repeat(48)),
        web3.utils.fromAscii('\x14'.repeat(48)),
        web3.utils.fromAscii('\x15'.repeat(48))
      ];
      for (let i = 0; i < 4; i++) {
        const { tx } = await pools.registerValidator(pubKeys[i], signature, {
          from: operator
        });
        totalAmount.isub(validatorDepositAmount);

        await checkValidatorRegistered({
          transaction: tx,
          entityId: getEntityId(POOLS_ENTITY_PREFIX, 4 - i),
          pubKey: pubKeys[i],
          validatorsRegistry: validatorsRegistry,
          signature
        });
      }

      // Registrations are not possible anymore
      await expectRevert(
        pools.registerValidator(pubKey, signature, {
          from: operator
        }),
        'There are no ready entities.'
      );
      await checkCollectorBalance(pools, new BN(0));
    });
  }
);
