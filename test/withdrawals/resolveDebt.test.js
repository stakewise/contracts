const { expect } = require('chai');
const {
  BN,
  send,
  expectEvent,
  expectRevert,
  ether,
  balance,
  constants,
  time,
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
  getEntityId,
} = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const maintainerFee = new BN('2000');
const prevEntityReward = ether('0.034871228');
const prevEntityMaintainerReward = ether('0.0069742456');
const prevEntityUserReward = ether('0.0278969824');
const stakingDuration = new BN('31536000');

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
    validators,
    validatorId;
  let [admin, operator, manager, sender, recipient, other] = accounts;

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
    pools = await Pools.at(proxies.pools);
    validators = await Validators.at(proxies.validators);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    // set maintainer's fee
    settings = await Settings.at(proxies.settings);
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    // set staking duration
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin,
    });

    // register new validator
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      recipient: other,
    });

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));

    // register new ready entity
    await pools.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount,
    });

    // transfer validator to the new entity
    let poolId = getEntityId(pools.address, new BN(2));
    await pools.transferValidator(
      validatorId,
      prevEntityReward,
      poolId,
      constants.ZERO_BYTES32,
      {
        from: operator,
      }
    );

    // assign wallet to transferred validator
    const { logs } = await validators.assignWallet(validatorId, {
      from: manager,
    });
    wallet = logs[0].args.wallet;
  });

  it('only Withdrawals contract can resolve debts', async () => {
    await expectRevert(
      validatorTransfers.resolveDebt(validatorId, {
        from: admin,
      }),
      'Permission denied.'
    );
  });

  it('resolves validator debts when unlocking wallet', async () => {
    let validatorBalance = validatorDepositAmount
      .add(prevEntityReward)
      .add(curEntityReward);

    // deposit + rewards received from the chain
    await send.ether(other, wallet, validatorBalance);

    // unlock wallet
    const { tx } = await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    // wallet unlocked
    await expectEvent.inTransaction(tx, withdrawals, 'WalletUnlocked', {
      wallet,
    });

    // debts and maintainer reward transferred
    expect(await balance.current(wallet)).to.be.bignumber.equal(
      validatorBalance.sub(prevEntityReward).sub(curEntityMaintainerReward)
    );

    // Debt resolved
    await expectEvent.inTransaction(tx, validatorTransfers, 'DebtResolved', {
      validatorId,
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

  it('resolves validator debts when unlocking wallet for penalised validator', async () => {
    let validatorBalance = validatorDepositAmount.sub(ether('3'));

    // penalised deposit received from the chain
    await send.ether(other, wallet, validatorBalance);

    // unlock wallet
    const { tx } = await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    // Wallet unlocked
    await expectEvent.inTransaction(tx, withdrawals, 'WalletUnlocked', {
      wallet,
    });

    // debts and maintainer reward transferred
    expect(await balance.current(wallet)).to.be.bignumber.equal(
      validatorBalance.sub(prevEntityReward)
    );

    // Debt resolved
    await expectEvent.inTransaction(tx, validatorTransfers, 'DebtResolved', {
      validatorId,
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

    // unlock wallet first time
    await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    // unlock wallet second time
    await expectRevert(
      withdrawals.unlockWallet(validatorId, {
        from: manager,
      }),
      'Wallet is already unlocked.'
    );
  });
});
