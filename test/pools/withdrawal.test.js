const { expect } = require('chai');
const {
  BN,
  send,
  balance,
  expectEvent,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  registerValidator,
  validatorRegistrationArgs,
  getDepositAmount,
  getEntityId,
} = require('../common/utils');
const { testCases, penalisedTestCases } = require('./withdrawalTestCases');

const Validators = artifacts.require('Validators');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Pools = artifacts.require('Pools');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');

contract('Pools (withdrawal)', ([_, ...accounts]) => {
  let networkConfig, pools, settings, validators, withdrawals, vrc, dai;
  let [admin, operator, manager, other, sender, ...otherAccounts] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
    dai = await deployDAI(admin, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    pools = await Pools.at(proxies.pools);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validators = await Validators.at(proxies.validators);
    settings = await Settings.at(proxies.settings);
  });

  it('user can withdraw deposit from penalised validator', async () => {
    for (const [
      testCaseN,
      { validatorReturn, users },
    ] of penalisedTestCases.entries()) {
      // populate pool with deposits
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit,
        });
      }

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        entityId: getEntityId(pools.address, new BN(testCaseN + 1)),
        poolsProxy: pools.address,
        operator,
      });

      // Time for withdrawal, assign wallet
      let receipt = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, penalised deposit returned
      let walletBalance = validatorReturn;
      await send.ether(other, wallet, walletBalance);

      // Unlock wallet
      receipt = await withdrawals.unlockWallet(validatorId, {
        from: manager,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        withdrawals,
        'WalletUnlocked',
        {
          wallet,
        }
      );

      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his penalised deposit
        receipt = await withdrawals.withdraw(validatorId, otherAccounts[j], {
          from: sender,
        });

        expectEvent(receipt, 'UserWithdrawn', {
          entityId: getEntityId(pools.address, new BN(testCaseN + 1)),
          sender: sender,
          recipient: otherAccounts[j],
          depositAmount: users[j].penalisedReturn,
          rewardAmount: new BN(0),
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
      { validatorReturn, maintainerFee, maintainerReward, users },
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // populate pool with deposits
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit,
        });
      }

      // Register validator
      let entityId = getEntityId(pools.address, new BN(testCaseN + 1));
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        entityId,
        poolsProxy: pools.address,
        operator,
      });

      // Time for withdrawal, assign wallet
      let receipt = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, deposit and rewards returned
      let walletBalance = validatorReturn;
      await send.ether(other, wallet, walletBalance);

      // Unlock wallet
      receipt = await withdrawals.unlockWallet(validatorId, {
        from: manager,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        withdrawals,
        'WalletUnlocked',
        {
          wallet,
        }
      );

      // Maintainer has withdrawn correct fee
      expectEvent(receipt, 'MaintainerWithdrawn', {
        maintainer: initialSettings.maintainer,
        entityId,
        amount: maintainerReward,
      });
      walletBalance.isub(maintainerReward);

      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his deposit and rewards
        receipt = await withdrawals.withdraw(validatorId, otherAccounts[j], {
          from: sender,
        });

        expectEvent(receipt, 'UserWithdrawn', {
          entityId,
          sender: sender,
          recipient: otherAccounts[j],
          depositAmount: users[j].deposit,
          rewardAmount: users[j].reward,
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
        max: validatorDepositAmount.div(new BN(10)),
      });
      await pools.addDeposit(otherAccounts[deposits.length], {
        from: sender,
        value: deposit,
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
    let entityId = getEntityId(pools.address, new BN(1));
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[1],
      entityId,
      poolsProxy: pools.address,
      operator,
    });

    // Time for withdrawal, assign wallet
    let receipt = await validators.assignWallet(validatorId, {
      from: manager,
    });
    let wallet = receipt.logs[0].args.wallet;

    // Withdrawal performed, deposit and rewards returned
    await send.ether(
      other,
      wallet,
      getDepositAmount({
        min: validatorDepositAmount,
      })
    );

    // Unlock wallet
    let { tx } = await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    await expectEvent.inTransaction(tx, withdrawals, 'WalletUnlocked', {
      wallet,
    });

    for (let i = 0; i < deposits.length; i++) {
      let recipient = otherAccounts[i];

      // User withdraws his deposit and rewards
      let receipt = await withdrawals.withdraw(validatorId, recipient, {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId,
        sender,
        recipient,
        depositAmount: deposits[i],
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
