const {
  expectRevert,
  expectEvent,
  ether,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, registerValidator } = require('../common/utils');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');

contract('WalletsRegistry', ([_, ...accounts]) => {
  let walletsRegistry, proxies, validatorId, networkConfig, vrc;
  let [admin, operator, sender, recipient, manager] = accounts;

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
      vrc: vrc.options.address,
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      recipient,
    });
  });

  describe('assigning wallet', () => {
    it('user without manager role cannot assign wallets', async () => {
      for (const user of [admin, operator, sender]) {
        await expectRevert(
          walletsRegistry.assignWallet(validatorId, {
            from: user,
          }),
          'Permission denied.'
        );
      }
    });

    it('cannot assign wallet to the same validator more than once', async () => {
      await walletsRegistry.assignWallet(validatorId, {
        from: manager,
      });

      await expectRevert(
        walletsRegistry.assignWallet(validatorId, {
          from: manager,
        }),
        'Validator has already wallet assigned.'
      );
    });

    it('cannot assign wallet to the non existing validator', async () => {
      await expectRevert(
        walletsRegistry.assignWallet(
          web3.utils.soliditySha3('invalidValidator'),
          {
            from: manager,
          }
        ),
        'Validator does not have deposit amount.'
      );
    });

    it('creates a new wallet', async () => {
      const receipt = await walletsRegistry.assignWallet(validatorId, {
        from: manager,
      });
      const wallet = receipt.logs[0].args.wallet;

      // Wallet assigned to validator
      expectEvent(receipt, 'WalletAssigned', {
        wallet,
        validatorId,
      });

      // Validator is marked as assigned
      expect(await walletsRegistry.assignedValidators(validatorId)).equal(true);
    });
  });

  // More unlocking tests are in Withdrawals.test.js
  describe('unlocking wallet', () => {
    let wallet;
    let users = [admin, operator, manager, sender];

    beforeEach(async () => {
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: manager,
      });
      wallet = logs[0].args.wallet;
    });

    it('only withdrawals contract can unlock wallets', async () => {
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          walletsRegistry.unlockWallet(wallet, ether('1'), {
            from: users[i],
          }),
          'Permission denied.'
        );
      }
    });
  });
});
