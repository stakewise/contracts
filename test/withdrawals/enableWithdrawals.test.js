const { expect } = require('chai');
const {
  BN,
  send,
  expectRevert,
  balance,
  ether,
  expectEvent,
  constants
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  registerValidator,
  validatorRegistrationArgs,
  getEntityId
} = require('../common/utils');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');

contract('Withdrawals (enable)', ([_, ...accounts]) => {
  let networkConfig,
    proxies,
    settings,
    walletsRegistry,
    wallet,
    withdrawals,
    validatorId,
    vrc;

  let [admin, operator, walletsManager, other] = accounts;

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

    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    settings = await Settings.at(proxies.settings);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    wallet = logs[0].args.wallet;
  });

  it('user without manager role cannot enable withdrawals', async () => {
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
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
        from: walletsManager
      }),
      'Wallet is not assigned to any validator.'
    );
  });

  it('cannot enable withdrawals for wallet with zero balance', async () => {
    await expectRevert(
      withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      }),
      'Wallet has not enough ether in it.'
    );
  });

  it('cannot enable withdrawals for already unlocked wallet', async () => {
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    await expectRevert(
      withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      }),
      'Wallet is already unlocked.'
    );
  });

  it("penalty is not applied if balance is not less than validator's deposit", async () => {
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validatorId,
      wallet,
      usersBalance: initialSettings.validatorDepositAmount
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
      [ether('31.987654321'), ether('0.99961419753125')]
    ];

    for (let i = 0; i < tests.length; i++) {
      // Collect deposits, create validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[i + 1],
        poolsProxy: proxies.pools,
        operator,
        sender: other,
        withdrawer: other
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      const [withdrawalReturn, expectedPenalty] = tests[i];

      // Withdrawal performed, penalized deposit returned
      await send.ether(other, wallet, withdrawalReturn);

      // Enable withdrawals, check whether penalty calculated properly
      receipt = await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });
      await expectEvent.inTransaction(
        receipt.tx,
        walletsRegistry,
        'WalletUnlocked',
        {
          validatorId,
          wallet,
          usersBalance: withdrawalReturn
        }
      );
      expect(
        await withdrawals.validatorPenalties(validatorId)
      ).to.be.bignumber.equal(expectedPenalty);
    }
  });

  it('unlocks the wallet for withdrawals', async () => {
    // initially wallet is locked
    expect((await walletsRegistry.wallets(wallet)).unlocked).equal(false);
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);

    // enable withdrawals
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // wallet must be unlocked
    expect((await walletsRegistry.wallets(wallet)).unlocked).equal(true);
  });

  it("doesn't send maintainer's reward when no profit", async () => {
    // start tracking maintainer's balance
    const maintainerBalance = await balance.tracker(initialSettings.maintainer);
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);

    // enable withdrawals
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validatorId,
      wallet,
      usersBalance: initialSettings.validatorDepositAmount
    });

    // maintainer's balance hasn't changed
    expect(await maintainerBalance.delta()).to.be.bignumber.equal('0');
  });

  it("calculates maintainer's reward correctly", async () => {
    let tests = [
      // validator reward, maintainer's fee, expected maintainer's reward
      ['20884866385064848799', '9561', '19968020750760501936'],
      ['35901110095648257832', '7337', '26340644477177126771'],
      ['13050766221027247901', '9999', '13049461144405145176'],
      ['43915781067913393044', '6465', '28391552460406008602'],
      ['55282543863516569837', '8625', '47681194082283041484'],
      ['25619926040557835738', '4200', '10760368937034291009'],
      ['98340000673116247278', '65', '639210004375255607'],
      ['28044828751583387617', '453', '1270430742446727459'],
      ['57667042368295430137', '8', '46133633894636344'],
      ['31626521340343186340', '9876', '31234352475722930829']
    ];

    // start tracking maintainer's balance
    const maintainer = initialSettings.maintainer;
    const maintainerBalance = await balance.tracker(maintainer);

    const validatorDepositAmount = new BN(
      initialSettings.validatorDepositAmount
    );

    // run tests
    let receipt;
    for (let i = 0; i < tests.length; i++) {
      const [validatorReward, maintainerFee, expectedMaintainerReward] = tests[
        i
      ];

      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // collect deposits, create validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[i + 1],
        poolsProxy: proxies.pools,
        operator,
        sender: other,
        withdrawer: other
      });

      // time for withdrawal, assign wallet
      receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // validator receives deposits and rewards from network
      await send.ether(
        other,
        wallet,
        validatorDepositAmount.add(new BN(validatorReward))
      );

      // enable withdrawals
      receipt = await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });
      await expectEvent.inTransaction(
        receipt.tx,
        walletsRegistry,
        'WalletUnlocked',
        {
          validatorId,
          wallet,
          usersBalance: validatorDepositAmount
            .add(new BN(validatorReward))
            .sub(new BN(expectedMaintainerReward))
        }
      );

      // maintainer's reward calculated properly
      expectEvent(receipt, 'MaintainerWithdrawn', {
        maintainer,
        entityId: getEntityId(proxies.pools, new BN(i + 2)),
        amount: expectedMaintainerReward
      });

      // maintainer's balance changed
      expect(await maintainerBalance.delta()).to.be.bignumber.equal(
        new BN(expectedMaintainerReward)
      );

      // wallet's balance changed
      expect(await balance.current(wallet)).to.be.bignumber.equal(
        validatorDepositAmount
          .add(new BN(validatorReward))
          .sub(new BN(expectedMaintainerReward))
      );

      // wallet unlocked
      expect((await walletsRegistry.wallets(wallet)).unlocked).equal(true);
    }
  });
});
