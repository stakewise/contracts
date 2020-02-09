const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  constants,
  balance
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  getDepositAmount,
  removeNetworkFile,
  checkUserTotalAmount,
  checkCollectorBalance,
  checkDepositCanceled
} = require('../utils');

const Deposits = artifacts.require('Deposits');
const Pools = artifacts.require('Pools');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const userDepositMinUnit = new BN(initialSettings.userDepositMinUnit);

contract('Pools', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, pools, amount1, amount2, poolsBalance;
  [
    admin,
    transfersManager,
    sender1,
    withdrawer1,
    sender2,
    withdrawer2
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
    let { deposits: depositsProxy, pools: poolsProxy } = await deployAllProxies(
      {
        initialAdmin: admin,
        transfersManager,
        networkConfig,
        vrc: vrc.options.address
      }
    );
    pools = await Pools.at(poolsProxy);
    deposits = await Deposits.at(depositsProxy);

    amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: amount1
    });

    amount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    await pools.addDeposit(withdrawer2, {
      from: sender2,
      value: amount2
    });
    poolsBalance = amount1.add(amount2);
  });

  it('fails to cancel a deposit with invalid cancel amount', async () => {
    await expectRevert(
      pools.cancelDeposit(withdrawer1, ether('0'), { from: sender1 }),
      'Cancel amount cannot be zero.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with invalid withdrawer address', async () => {
    await expectRevert(
      pools.cancelDeposit(constants.ZERO_ADDRESS, ether('1'), {
        from: sender1
      }),
      'User does not have specified cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with maximal uint value', async () => {
    await expectRevert(
      pools.cancelDeposit(withdrawer1, constants.MAX_UINT256, {
        from: sender1
      }),
      'Invalid cancel amount unit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      pools.cancelDeposit(withdrawer2, ether('1'), { from: sender1 }),
      'User does not have specified cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount2,
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender2,
      withdrawerAddress: withdrawer2
    });
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      pools.cancelDeposit(withdrawer1, amount1.add(ether('1')), {
        from: sender1
      }),
      'User does not have specified cancel amount.'
    );
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit located in the ready pool', async () => {
    const cancelAmount = validatorDepositAmount;
    await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: cancelAmount
    });
    await expectRevert(
      pools.cancelDeposit(withdrawer1, cancelAmount, {
        from: sender1
      }),
      'User does not have specified cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount.sub(amount2),
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(pools, poolsBalance.add(cancelAmount));
  });

  it('fails to cancel a deposit with too small unit', async () => {
    const cancelAmount = amount1.sub(userDepositMinUnit.sub(new BN(1)));
    await expectRevert(
      pools.cancelDeposit(withdrawer1, cancelAmount, {
        from: sender1
      }),
      'Invalid cancel amount unit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: new BN(1),
      collectorAddress: pools.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('cancels deposit in full amount', async () => {
    const withdrawerBalance = await balance.tracker(withdrawer1);
    const { tx } = await pools.cancelDeposit(withdrawer1, amount1, {
      from: sender1
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: new BN(1),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      canceledAmount: amount1,
      totalAmount: ether('0')
    });

    // Check withdrawer balance changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(amount1);

    // Check Pools balance
    await checkCollectorBalance(pools, poolsBalance.sub(amount1));
  });

  it('cancels deposit in partial amount', async () => {
    const withdrawerBalance = await balance.tracker(withdrawer1);
    const cancelAmount = amount1.sub(userDepositMinUnit);
    const { tx } = await pools.cancelDeposit(withdrawer1, cancelAmount, {
      from: sender1
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: new BN(1),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      canceledAmount: cancelAmount,
      totalAmount: amount1.sub(cancelAmount)
    });

    // Check withdrawer balance changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(cancelAmount);

    // Check Pools balance
    await checkCollectorBalance(pools, poolsBalance.sub(cancelAmount));
  });

  it('cancels deposit partially moved to the next pool', async () => {
    const withdrawerBalance = await balance.tracker(withdrawer1);
    await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: validatorDepositAmount
    });

    const cancelAmount = validatorDepositAmount.sub(
      validatorDepositAmount.sub(poolsBalance)
    );
    const { tx } = await pools.cancelDeposit(withdrawer1, cancelAmount, {
      from: sender1
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: new BN(2),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      canceledAmount: cancelAmount,
      totalAmount: new BN(0)
    });

    // Check withdrawer balance changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(cancelAmount);

    // Check Pools balance
    await checkCollectorBalance(
      pools,
      poolsBalance.add(validatorDepositAmount).sub(cancelAmount)
    );
  });
});
