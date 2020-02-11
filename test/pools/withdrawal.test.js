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
  getDepositAmount
} = require('../common/utils');
const { testCases, penalisedTestCases } = require('./withdrawalTestCases');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Pools = artifacts.require('Pools');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');

contract('Pools (withdrawal)', ([_, ...accounts]) => {
  let networkConfig, pools, settings, walletsRegistry, withdrawals, vrc;
  let [
    admin,
    operator,
    transfersManager,
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
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    pools = await Pools.at(proxies.pools);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    settings = await Settings.at(proxies.settings);
  });

  it('user can withdraw deposit from penalised validator', async () => {
    for (const [
      testCaseN,
      { validatorReturn, users }
    ] of penalisedTestCases.entries()) {
      // populate pool with deposits
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit
        });
      }

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        hasReadyEntity: true,
        poolsProxy: pools.address,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, penalised deposit returned
      let walletBalance = validatorReturn;
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
          balance: walletBalance
        }
      );

      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his penalised deposit
        receipt = await withdrawals.withdraw(wallet, otherAccounts[j], {
          from: sender
        });

        expectEvent(receipt, 'UserWithdrawn', {
          wallet,
          sender: sender,
          withdrawer: otherAccounts[j],
          deposit: users[j].penalisedReturn,
          reward: new BN(0)
        });

        // User's balance has changed
        expect(await userBalance.delta()).to.be.bignumber.equal(
          users[j].penalisedReturn
        );

        // Wallet's balance has changed
        expect(await balance.current(wallet)).to.be.bignumber.equal(
          walletBalance.isub(users[j].penalisedReturn)
        );
      }

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });

  it('user can withdraw deposit and reward from validator', async () => {
    for (const [
      testCaseN,
      { validatorReturn, maintainerFee, maintainerReward, users }
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // populate pool with deposits
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit
        });
      }

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        hasReadyEntity: true,
        poolsProxy: pools.address,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, deposit and rewards returned
      let walletBalance = validatorReturn;
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
          balance: walletBalance
        }
      );

      // Maintainer has withdrawn correct fee
      expectEvent(receipt, 'MaintainerWithdrawn', {
        maintainer: initialSettings.maintainer,
        wallet,
        amount: maintainerReward
      });
      walletBalance.isub(maintainerReward);

      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his deposit and rewards
        receipt = await withdrawals.withdraw(wallet, otherAccounts[j], {
          from: sender
        });

        expectEvent(receipt, 'UserWithdrawn', {
          wallet,
          sender: sender,
          withdrawer: otherAccounts[j],
          deposit: users[j].deposit,
          reward: users[j].reward
        });

        // User's balance has changed
        expect(await userBalance.delta()).to.be.bignumber.equal(
          users[j].deposit.add(users[j].reward)
        );

        // Wallet's balance has changed
        expect(await balance.current(wallet)).to.be.bignumber.equal(
          walletBalance.isub(users[j].deposit.add(users[j].reward))
        );
      }

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });

  it('can withdraw with random deposits', async () => {
    // Set random maintainer fee
    const maintainerFee = new BN(Math.random().toFixed(4) * 10000);
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    const validatorDepositAmount = new BN(
      initialSettings.validatorDepositAmount
    );

    // Generate random deposits to pools
    let poolsBalance = new BN(0);
    let deposits = [];
    while (poolsBalance.lt(validatorDepositAmount)) {
      let deposit = getDepositAmount({
        max: validatorDepositAmount.div(new BN(10))
      });
      await pools.addDeposit(otherAccounts[deposits.length], {
        from: sender,
        value: deposit
      });
      poolsBalance.iadd(deposit);
      deposits.push(deposit);
    }

    // Last deposit could be split
    if (poolsBalance.gt(validatorDepositAmount)) {
      deposits[deposits.length - 1] = deposits[deposits.length - 1].sub(
        poolsBalance.sub(validatorDepositAmount)
      );
    }

    // Start validator
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[1],
      hasReadyEntity: true,
      poolsProxy: pools.address,
      operator
    });

    // Time for withdrawal, assign wallet
    let receipt = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    let wallet = receipt.logs[0].args.wallet;

    // Withdrawal performed, deposit and rewards returned
    const walletBalance = getDepositAmount({
      min: validatorDepositAmount
    });
    await send.ether(other, wallet, walletBalance);

    // Enable withdrawals
    let { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validator: validatorId,
      wallet,
      balance: walletBalance
    });

    for (let i = 0; i < deposits.length; i++) {
      let withdrawer = otherAccounts[i];

      // User withdraws his deposit and rewards
      let receipt = await withdrawals.withdraw(wallet, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        wallet,
        sender,
        withdrawer,
        deposit: deposits[i]
      });
    }

    // all deposits have been withdrawn
    expect(
      await withdrawals.validatorLeftDeposits(validatorId)
    ).to.be.bignumber.equal(new BN(0));

    // wallet is empty
    expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
  });
});
