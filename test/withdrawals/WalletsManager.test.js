const {
  expectRevert,
  expectEvent,
  constants
} = require('openzeppelin-test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile } = require('../utils');
const { createValidator } = require('./common');

const WalletsManager = artifacts.require('WalletsManager');
const Operators = artifacts.require('Operators');

contract('WalletsManager', ([_, admin, operator, sender, withdrawer]) => {
  let walletsManager;
  let validatorId;
  let proxies;
  let networkConfig;

  beforeEach(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC(admin);
    proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });
    walletsManager = await WalletsManager.at(proxies.walletsManager);
    validatorId = await createValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      withdrawer
    });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  describe('assigning wallet', () => {
    it('user without admin role cannot assign wallets', async () => {
      await expectRevert(
        walletsManager.assignWallet(validatorId, {
          from: operator
        }),
        'Permission denied.'
      );
    });

    it('cannot assign wallet to the same validator more than once', async () => {
      await walletsManager.assignWallet(validatorId, {
        from: admin
      });

      await expectRevert(
        walletsManager.assignWallet(validatorId, {
          from: admin
        }),
        'Validator has already wallet assigned.'
      );
    });

    it('cannot assign wallet to the non existing validator', async () => {
      await expectRevert(
        walletsManager.assignWallet(
          web3.utils.soliditySha3('invalidValidator'),
          {
            from: admin
          }
        ),
        'Validator does not have deposit amount.'
      );
    });

    it('creates a new wallet', async () => {
      const { logs } = await walletsManager.assignWallet(validatorId, {
        from: admin
      });
      const wallet = logs[0].args.wallet;

      // Wallet created
      expectEvent.inLogs(logs, 'WalletCreated', { wallet });

      // Wallet assigned to validator
      expectEvent.inLogs(logs, 'WalletAssigned', {
        wallet,
        validator: validatorId
      });

      // Validator is marked as assigned
      expect(await walletsManager.assignedValidators(validatorId)).to.be.equal(
        true
      );
    });

    it('re-uses existing available wallet', async () => {
      let logs;

      ({ logs } = await walletsManager.assignWallet(validatorId, {
        from: admin
      }));

      // reset wallet
      const wallet = logs[0].args.wallet;
      await walletsManager.resetWallet(wallet, {
        from: admin
      });

      // Deploy next validator
      let newValidatorId = await createValidator({
        pubKey: web3.utils.fromAscii('\x12'.repeat(48)),
        poolsProxy: proxies.pools,
        operator,
        sender,
        withdrawer
      });

      ({ logs } = await walletsManager.assignWallet(newValidatorId, {
        from: admin
      }));

      // must assign the same wallet to the next validator
      expectEvent.inLogs(logs, 'WalletAssigned', {
        wallet,
        validator: newValidatorId
      });

      // Validator is marked as assigned
      expect(
        await walletsManager.assignedValidators(newValidatorId)
      ).to.be.equal(true);
    });
  });

  describe('resetting wallet', () => {
    let wallet;

    beforeEach(async () => {
      const { logs } = await walletsManager.assignWallet(validatorId, {
        from: admin
      });
      wallet = logs[0].args.wallet;
    });

    it('user without admin role cannot reset wallets', async () => {
      await expectRevert(
        walletsManager.resetWallet(wallet, {
          from: operator
        }),
        'Permission denied.'
      );
    });

    it('cannot reset the same wallet more than once', async () => {
      await walletsManager.resetWallet(wallet, {
        from: admin
      });

      await expectRevert(
        walletsManager.resetWallet(wallet, {
          from: admin
        }),
        'Wallet has been already reset.'
      );
    });

    it('admin user can reset wallet', async () => {
      const { logs } = await walletsManager.resetWallet(wallet, {
        from: admin
      });

      expectEvent.inLogs(logs, 'WalletReset', {
        wallet
      });
      let { unlocked, validator } = await walletsManager.wallets(wallet);
      expect(unlocked).to.be.equal(false);
      expect(validator).to.satisfy(val =>
        val.startsWith(constants.ZERO_ADDRESS)
      );
    });
  });

  // More unlocking tests are in Withdrawals.test.js
  describe('unlocking wallet', () => {
    let wallet;
    let users = [admin, operator, sender];

    beforeEach(async () => {
      const { logs } = await walletsManager.assignWallet(validatorId, {
        from: admin
      });
      wallet = logs[0].args.wallet;
    });

    it('only withdrawals contract can unlock wallets', async () => {
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          walletsManager.unlockWallet(wallet, {
            from: users[i]
          }),
          'Permission denied.'
        );
      }
    });
  });
});
