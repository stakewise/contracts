const { expect } = require('chai');
const {
  BN,
  send,
  expectEvent,
  ether,
  balance
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, registerValidator } = require('../utils');

const Privates = artifacts.require('Privates');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const prevEntityReward = ether('0.034871228');

contract('Validator Transfer Debt', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    withdrawals,
    privates,
    settings,
    wallet,
    validatorTransfers,
    walletsRegistry,
    validatorId;
  let [
    admin,
    operator,
    transfersManager,
    walletsManager,
    sender,
    withdrawer,
    other
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
    let {
      privates: privatesProxy,
      operators: operatorsProxy,
      walletsManagers: walletsManagersProxy,
      withdrawals: withdrawalsProxy,
      walletsRegistry: walletsRegistryProxy,
      validatorTransfers: validatorTransfersProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    privates = await Privates.at(privatesProxy);
    walletsRegistry = await WalletsRegistry.at(walletsRegistryProxy);
    withdrawals = await Withdrawals.at(withdrawalsProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransfersProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(walletsManagersProxy);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set staking duration
    settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(privates.address, stakingDuration, {
      from: admin
    });

    // register new validator
    validatorId = await registerValidator({
      privatesProxy,
      operator,
      sender: other,
      withdrawer: other
    });

    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // transfer validator to the new entity
    await privates.transferValidator(validatorId, prevEntityReward, {
      from: transfersManager
    });

    // assign wallet to transferred validator
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    wallet = logs[0].args.wallet;
  });

  it('resolves validator debts when enabling withdrawals', async () => {
    let validatorBalance = validatorDepositAmount
      .add(prevEntityReward)
      .add(ether('1'));
    // deposit + rewards received from the chain
    await send.ether(other, wallet, validatorBalance);

    // enable withdrawals
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    // Wallet unlocked
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validator: validatorId,
      wallet
      // balance: validatorBalance.sub(prevEntityReward)
    });
    expect(await balance.current(wallet)).to.be.bignumber.equal(
      validatorBalance.sub(prevEntityReward)
    );

    // Debt resolved
    await expectEvent.inTransaction(tx, validatorTransfers, 'DebtResolved', {
      validatorId
    });
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount.add(prevEntityReward));
  });

  // it('resolves validator debts when enabling withdrawals for penalised validator', async () => {
  //   await send.ether(other, wallet, validatorDepositAmount);
  //   const { tx } = await withdrawals.enableWithdrawals(wallet, {
  //     from: walletsManager
  //   });
  //   await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
  //     validator: validatorId,
  //     wallet,
  //     balance: validatorDepositAmount.sub(prevEntityReward)
  //   });
  // });
  //
  // it('cannot resolve validator debts multiple times', () => {});
});
