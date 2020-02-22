const { expect } = require('chai');
const {
  BN,
  send,
  balance,
  expectEvent
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
  getCollectorEntityId
} = require('../common/utils');
const { testCases, penalisedTestCases } = require('./withdrawalTestCases');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Privates = artifacts.require('Privates');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');

contract('Privates (withdrawal)', ([_, ...accounts]) => {
  let networkConfig, privates, settings, walletsRegistry, withdrawals, vrc;
  let [
    admin,
    operator,
    walletsManager,
    other,
    sender,
    ...otherAccounts
  ] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    privates = await Privates.at(proxies.privates);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    settings = await Settings.at(proxies.settings);
  });

  it('can withdraw private deposit and reward from validator', async () => {
    for (const [
      testCaseN,
      { maintainerFee, maintainerReward, userDeposit, userReward }
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // User performs deposit equal to validator deposit amount
      await privates.addDeposit(otherAccounts[0], {
        from: sender,
        value: userDeposit
      });

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        hasReadyEntity: true,
        privatesProxy: privates.address,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, deposit and reward returned
      let walletBalance = userDeposit.add(maintainerReward).add(userReward);
      await send.ether(other, wallet, walletBalance);

      // Enable withdrawals
      receipt = await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });
      await expectEvent.inTransaction(
        receipt.tx,
        walletsRegistry,
        'WalletUnlocked',
        {
          validator: validatorId,
          wallet,
          usersBalance: walletBalance.sub(maintainerReward)
        }
      );

      let collectorEntityId = getCollectorEntityId(
        privates.address,
        new BN(testCaseN + 1)
      );

      // Maintainer has withdrawn correct fee
      expectEvent(receipt, 'MaintainerWithdrawn', {
        maintainer: initialSettings.maintainer,
        collectorEntityId,
        amount: maintainerReward
      });
      walletBalance.isub(maintainerReward);

      // track user's balance
      const userBalance = await balance.tracker(otherAccounts[0]);

      // User withdraws his deposit and reward
      receipt = await withdrawals.withdraw(wallet, otherAccounts[0], {
        from: sender
      });

      expectEvent(receipt, 'UserWithdrawn', {
        collectorEntityId,
        sender: sender,
        withdrawer: otherAccounts[0],
        depositAmount: userDeposit,
        rewardAmount: userReward
      });

      // User's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(
        userDeposit.add(userReward)
      );

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });

  it('can withdraw private deposit from penalised validator', async () => {
    for (const [
      testCaseN,
      { userDeposit, userPenalisedReturn }
    ] of penalisedTestCases.entries()) {
      // User performs deposit equal to validator deposit amount
      await privates.addDeposit(otherAccounts[0], {
        from: sender,
        value: userDeposit
      });

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        hasReadyEntity: true,
        privatesProxy: privates.address,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, penalised deposit returned
      let walletBalance = userPenalisedReturn;
      await send.ether(other, wallet, walletBalance);

      // Enable withdrawals
      receipt = await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });
      await expectEvent.inTransaction(
        receipt.tx,
        walletsRegistry,
        'WalletUnlocked',
        {
          validator: validatorId,
          wallet,
          usersBalance: walletBalance
        }
      );

      // track user's balance
      const userBalance = await balance.tracker(otherAccounts[0]);

      // User withdraws his deposit and reward
      receipt = await withdrawals.withdraw(wallet, otherAccounts[0], {
        from: sender
      });

      expectEvent(receipt, 'UserWithdrawn', {
        collectorEntityId: getCollectorEntityId(
          privates.address,
          new BN(testCaseN + 1)
        ),
        sender: sender,
        withdrawer: otherAccounts[0],
        depositAmount: userPenalisedReturn,
        rewardAmount: new BN(0)
      });

      // User's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(
        userPenalisedReturn
      );

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });
});
