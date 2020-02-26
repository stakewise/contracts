const {
  expectRevert,
  expectEvent,
  ether,
  constants
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  registerValidator,
  validatorRegistrationArgs
} = require('../common/utils');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');

contract('WalletsRegistry', ([_, ...accounts]) => {
  let walletsRegistry, proxies, validatorId, networkConfig, vrc;
  let [admin, operator, sender, withdrawer, walletsManager] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      withdrawer
    });
  });

  describe('assigning wallet', () => {
    it('user without manager role cannot assign wallets', async () => {
      for (const user of [admin, operator, sender]) {
        await expectRevert(
          walletsRegistry.assignWallet(validatorId, {
            from: user
          }),
          'Permission denied.'
        );
      }
    });

    it('cannot assign wallet to the same validator more than once', async () => {
      await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });

      await expectRevert(
        walletsRegistry.assignWallet(validatorId, {
          from: walletsManager
        }),
        'Validator has already wallet assigned.'
      );
    });

    it('cannot assign wallet to the non existing validator', async () => {
      await expectRevert(
        walletsRegistry.assignWallet(
          web3.utils.soliditySha3('invalidValidator'),
          {
            from: walletsManager
          }
        ),
        'Validator does not have deposit amount.'
      );
    });

    it('creates a new wallet', async () => {
      const receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      const wallet = receipt.logs[0].args.wallet;

      // Wallet assigned to validator
      expectEvent(receipt, 'WalletAssigned', {
        wallet,
        validator: validatorId
      });

      // Validator is marked as assigned
      expect(await walletsRegistry.assignedValidators(validatorId)).equal(true);
    });

    it('re-uses existing available wallet', async () => {
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });

      // reset wallet
      const wallet = logs[0].args.wallet;
      await walletsRegistry.resetWallet(wallet, {
        from: admin
      });

      // Deploy next validator
      let newValidatorId = await registerValidator({
        args: validatorRegistrationArgs[1],
        privatesProxy: proxies.privates,
        operator,
        sender,
        withdrawer
      });

      let receipt = await walletsRegistry.assignWallet(newValidatorId, {
        from: walletsManager
      });

      // must assign the same wallet to the next validator
      expectEvent(receipt, 'WalletAssigned', {
        wallet,
        validator: newValidatorId
      });

      // Validator is marked as assigned
      expect(await walletsRegistry.assignedValidators(newValidatorId)).equal(
        true
      );
    });
  });

  describe('resetting wallet', () => {
    let wallet;

    beforeEach(async () => {
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      wallet = logs[0].args.wallet;
    });

    it('user without admin role cannot reset wallets', async () => {
      await expectRevert(
        walletsRegistry.resetWallet(wallet, {
          from: walletsManager
        }),
        'Permission denied.'
      );
    });

    it('cannot reset the same wallet more than once', async () => {
      await walletsRegistry.resetWallet(wallet, {
        from: admin
      });

      await expectRevert(
        walletsRegistry.resetWallet(wallet, {
          from: admin
        }),
        'Wallet has been already reset.'
      );
    });

    it('admin user can reset wallet', async () => {
      let receipt = await walletsRegistry.resetWallet(wallet, {
        from: admin
      });

      expectEvent(receipt, 'WalletReset', {
        wallet
      });
      let { unlocked, validator } = await walletsRegistry.wallets(wallet);
      expect(unlocked).equal(false);
      expect(validator).to.satisfy(val =>
        val.startsWith(constants.ZERO_ADDRESS)
      );
    });
  });

  // More unlocking tests are in Withdrawals.test.js
  describe('unlocking wallet', () => {
    let wallet;
    let users = [admin, operator, walletsManager, sender];

    beforeEach(async () => {
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      wallet = logs[0].args.wallet;
    });

    it('only withdrawals contract can unlock wallets', async () => {
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          walletsRegistry.unlockWallet(wallet, ether('1'), {
            from: users[i]
          }),
          'Permission denied.'
        );
      }
    });
  });
});
