const { BN, send, expectEvent, ether } = require('@openzeppelin/test-helpers');
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
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
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
      validatorsRegistry: validatorsRegistryProxy,
      validatorTransfers: validatorTransfersProxy,
      withdrawals: withdrawalsProxy,
      walletsRegistry: walletsRegistryProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    privates = await Privates.at(privatesProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransfersProxy);
    walletsRegistry = await WalletsRegistry.at(walletsRegistryProxy);
    withdrawals = await Withdrawals.at(withdrawalsProxy);

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
    await send.ether(other, wallet, validatorBalance);
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validator: validatorId,
      wallet,
      balance: validatorBalance.sub(prevEntityReward)
    });
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
