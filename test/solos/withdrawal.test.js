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
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  registerValidator,
  validatorRegistrationArgs,
  getEntityId,
} = require('../common/utils');
const { testCases, penalisedTestCases } = require('./withdrawalTestCases');

const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Solos = artifacts.require('Solos');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');

contract('Solos (withdrawal)', ([_, ...accounts]) => {
  let networkConfig, solos, settings, withdrawals, vrc, validators;
  let [admin, operator, manager, other, sender, ...otherAccounts] = accounts;

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
      vrc: vrc.options.address,
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    solos = await Solos.at(proxies.solos);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    settings = await Settings.at(proxies.settings);
    validators = await Validators.at(proxies.validators);
  });

  it('can withdraw solo deposit and reward from validator', async () => {
    for (const [
      testCaseN,
      { maintainerFee, maintainerReward, userDeposit, userReward },
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // user performs deposit equal to validator deposit amount
      await solos.addDeposit(otherAccounts[0], {
        from: sender,
        value: userDeposit,
      });

      // register validator
      let soloId = getEntityId(solos.address, new BN(testCaseN + 1));
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        entityId: soloId,
        solosProxy: solos.address,
        operator,
      });

      // time for withdrawal, assign wallet
      let receipt = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = receipt.logs[0].args.wallet;

      // withdrawal performed, deposit and reward returned
      let walletBalance = userDeposit.add(maintainerReward).add(userReward);
      await send.ether(other, wallet, walletBalance);

      // unlock wallet
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

      // maintainer has withdrawn correct fee
      expectEvent(receipt, 'MaintainerWithdrawn', {
        maintainer: initialSettings.maintainer,
        entityId: soloId,
        amount: maintainerReward,
      });
      walletBalance.isub(maintainerReward);

      // track user's balance
      const userBalance = await balance.tracker(otherAccounts[0]);

      // user withdraws his deposit and reward
      receipt = await withdrawals.withdraw(validatorId, otherAccounts[0], {
        from: sender,
      });

      expectEvent(receipt, 'UserWithdrawn', {
        entityId: soloId,
        sender: sender,
        recipient: otherAccounts[0],
        depositAmount: userDeposit,
        rewardAmount: userReward,
      });

      // User's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(
        userDeposit.add(userReward)
      );

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });

  it('can withdraw solo deposit from penalised validator', async () => {
    for (const [
      testCaseN,
      { userDeposit, userPenalisedReturn },
    ] of penalisedTestCases.entries()) {
      // user performs deposit equal to validator deposit amount
      await solos.addDeposit(otherAccounts[0], {
        from: sender,
        value: userDeposit,
      });

      // register validator
      let soloId = getEntityId(solos.address, new BN(testCaseN + 1));
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        entityId: soloId,
        solosProxy: solos.address,
        operator,
      });

      // time for withdrawal, assign wallet
      let receipt = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = receipt.logs[0].args.wallet;

      // withdrawal performed, penalised deposit returned
      await send.ether(other, wallet, userPenalisedReturn);

      // enable withdrawals
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

      // track user's balance
      const userBalance = await balance.tracker(otherAccounts[0]);

      // user withdraws his deposit and reward
      receipt = await withdrawals.withdraw(validatorId, otherAccounts[0], {
        from: sender,
      });

      expectEvent(receipt, 'UserWithdrawn', {
        entityId: soloId,
        sender: sender,
        recipient: otherAccounts[0],
        depositAmount: userPenalisedReturn,
        rewardAmount: new BN(0),
      });

      // user's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(
        userPenalisedReturn
      );

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    }
  });
});
