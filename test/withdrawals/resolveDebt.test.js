const { expect } = require('chai');
const {
  BN,
  send,
  expectEvent,
  expectRevert,
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
const { removeNetworkFile, registerValidator } = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const maintainerFee = new BN('2000');
const prevEntityReward = ether('0.034871228');
const prevEntityMaintainerReward = ether('0.0069742456');
const prevEntityUserReward = ether('0.0278969824');

const curEntityReward = ether('1');
const curEntityMaintainerReward = ether('0.2');

contract('Withdrawals (resolve debt)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    withdrawals,
    pools,
    settings,
    wallet,
    validatorTransfers,
    walletsRegistry,
    validatorId;
  let [admin, operator, walletsManager, sender, withdrawer, other] = accounts;

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
    pools = await Pools.at(proxies.pools);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set maintainer's fee
    settings = await Settings.at(proxies.settings);
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    // register new validator
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });

    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // transfer validator to the new entity
    await pools.transferValidator(validatorId, prevEntityReward, {
      from: operator
    });

    // assign wallet to transferred validator
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    wallet = logs[0].args.wallet;
  });

  it('only Withdrawals contract can resolve debts', async () => {
    await expectRevert(
      validatorTransfers.resolveDebt(validatorId, {
        from: admin
      }),
      'Permission denied.'
    );
  });

  it('resolves validator debts when enabling withdrawals', async () => {
    let validatorBalance = validatorDepositAmount
      .add(prevEntityReward)
      .add(curEntityReward);

    // deposit + rewards received from the chain
    await send.ether(other, wallet, validatorBalance);

    // enable withdrawals
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // Wallet unlocked
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validatorId,
      wallet,
      usersBalance: validatorBalance
        .sub(prevEntityReward)
        .sub(curEntityMaintainerReward)
    });

    // debts and maintainer reward transferred
    expect(await balance.current(wallet)).to.be.bignumber.equal(
      validatorBalance.sub(prevEntityReward).sub(curEntityMaintainerReward)
    );

    // Debt resolved
    await expectEvent.inTransaction(tx, validatorTransfers, 'DebtResolved', {
      validatorId
    });
    let validatorDebt = await validatorTransfers.validatorDebts(validatorId);
    expect(validatorDebt.userDebt).to.be.bignumber.equal(prevEntityUserReward);
    expect(validatorDebt.maintainerDebt).to.be.bignumber.equal(
      prevEntityMaintainerReward
    );
    expect(validatorDebt.resolved).equal(true);
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount.add(prevEntityUserReward));
  });

  it('resolves validator debts when enabling withdrawals for penalised validator', async () => {
    let validatorBalance = validatorDepositAmount.sub(ether('3'));

    // penalised deposit received from the chain
    await send.ether(other, wallet, validatorBalance);

    // enable withdrawals
    const { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // Wallet unlocked
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validatorId,
      wallet,
      usersBalance: validatorBalance.sub(prevEntityReward)
    });

    // debts and maintainer reward transferred
    expect(await balance.current(wallet)).to.be.bignumber.equal(
      validatorBalance.sub(prevEntityReward)
    );

    // Debt resolved
    await expectEvent.inTransaction(tx, validatorTransfers, 'DebtResolved', {
      validatorId
    });
    let validatorDebt = await validatorTransfers.validatorDebts(validatorId);
    expect(validatorDebt.userDebt).to.be.bignumber.equal(prevEntityUserReward);
    expect(validatorDebt.maintainerDebt).to.be.bignumber.equal(
      prevEntityMaintainerReward
    );
    expect(validatorDebt.resolved).equal(true);
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount.add(prevEntityUserReward));
  });

  it('cannot resolve validator debts multiple times', async () => {
    let validatorBalance = validatorDepositAmount
      .add(prevEntityReward)
      .add(curEntityReward);

    // deposit + rewards received from the chain
    await send.ether(other, wallet, validatorBalance);

    // enable withdrawals first time
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // enable withdrawals second time
    await expectRevert(
      withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      }),
      'Wallet is already unlocked.'
    );
  });
});
