const {
  BN,
  send,
  expectRevert,
  ether,
  expectEvent,
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

    it("does not apply penalty if balance is not less that validator's deposit", async () => {
      await send.ether(
        other,
        wallet,
        new BN(initialSettings.validatorDepositAmount)
      );
      const { logs } = await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });
      expectEvent.inLogs(logs, 'WithdrawalsEnabled', {
        penalty: new BN(0),
        wallet
      });
    });

    it('calculates penalties correctly', async () => {
      let tests = [
        // withdrawal return, correct penalty
        [ether('16'), ether('0.5')], // biggest slash possible
        [ether('31.999999999999999999'), ether('0.999999999999999999')], // smallest slash possible
        [ether('31.470154444639959214'), ether('0.983442326394998725')],
        [ether('22.400020050000300803'), ether('0.7000006265625094')],
        [ether('26.037398137005555372'), ether('0.813668691781423605')],
        [ether('18.345'), ether('0.57328125')],
        [ether('16.00145'), ether('0.5000453125')],
        [ether('31.987654321'), ether('0.999614197531250048')]
      ];

      let logs;
      for (let i = 0; i < tests.length; i++) {
        // Collect deposits, create validator
        let validatorId = await createValidator({
          pubKey: `0x${i.toString() * 48}`,
          poolsProxy: proxies.pools,
          operator,
          sender: other,
          withdrawer: other
        });

        // Time for withdrawal, assign wallet
        ({ logs } = await walletsManager.assignWallet(validatorId, {
          from: admin
        }));
        wallet = logs[0].args.wallet;

        const [withdrawalReturn, expectedPenalty] = tests[i];

        // Withdrawal performed, penalized deposit returned
        await send.ether(other, wallet, withdrawalReturn);

        // Enable withdrawals, check whether penalty calculated properly
        ({ logs } = await withdrawals.enableWithdrawals(wallet, {
          from: admin
        }));
        expectEvent.inLogs(logs, 'WithdrawalsEnabled', {
          penalty: expectedPenalty,
          wallet
        });
      }
    });

    it("calculates maintainer's reward correctly", async () => {});
  });
});
