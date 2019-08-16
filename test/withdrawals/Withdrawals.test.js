const {
  BN,
  send,
  expectRevert,
  constants
} = require('openzeppelin-test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile } = require('../utils');
const { createValidator } = require('./common');

const WalletsManager = artifacts.require('WalletsManager');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');

contract('Withdrawals', ([_, admin, operator, other]) => {
  let networkConfig;
  let proxies;
  let wallet;
  let walletsManager;
  let withdrawals;

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
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsManager = await WalletsManager.at(proxies.walletsManager);
    let validatorId = await createValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });
    const { logs } = await walletsManager.assignWallet(validatorId, {
      from: admin
    });
    wallet = logs[0].args.wallet;
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  describe('enabling withdrawals', () => {
    it('user without admin role cannot enable withdrawals', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: operator
        }),
        'Permission denied.'
      );
    });

    it('cannot enable withdrawals for wallet not assigned to any validator', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(constants.ZERO_ADDRESS, {
          from: admin
        }),
        'Wallet is not assigned to any validator.'
      );
    });

    it('cannot enable withdrawals for wallet with zero balance', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: admin
        }),
        'Wallet has no ether in it.'
      );
    });
    it('cannot enable withdrawals for already unlocked wallet', async () => {
      await send.ether(
        other,
        wallet,
        new BN(initialSettings.validatorDepositAmount)
      );
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: admin
        }),
        'Wallet is already unlocked.'
      );
    });

    it('does not apply penalty if there is a profit', async () => {
      await send.ether(
        other,
        wallet,
        new BN(initialSettings.validatorDepositAmount)
      );
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: admin
        }),
        'Wallet is already unlocked.'
      );
    });
    it('calculates penalties correctly', async () => {});
    it("calculates maintainer's reward correctly", async () => {});
  });
});
