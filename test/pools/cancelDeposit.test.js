const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  constants,
  balance,
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
  getDepositAmount,
  removeNetworkFile,
  checkUserTotalAmount,
  checkCollectorBalance,
  checkPendingPool,
  checkDepositCanceled,
  checkNewPoolCollectedAmount,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Pools = artifacts.require('Pools');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const userDepositMinUnit = new BN(initialSettings.userDepositMinUnit);

contract('Pools (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig,
    deposits,
    vrc,
    dai,
    pools,
    amount1,
    amount2,
    poolsBalance,
    poolId;
  let [admin, sender1, recipient1, sender2, recipient2] = accounts;

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
    let { deposits: depositsProxy, pools: poolsProxy } = await deployAllProxies(
      {
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.options.address,
        dai: dai.address,
      }
    );
    pools = await Pools.at(poolsProxy);
    deposits = await Deposits.at(depositsProxy);

    amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: amount1,
    });

    amount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pools.addDeposit(recipient2, {
      from: sender2,
      value: amount2,
    });
    poolsBalance = amount1.add(amount2);
    poolId = getEntityId(pools.address, new BN(1));
  });

  it('fails to cancel a deposit with invalid cancel amount', async () => {
    await expectRevert(
      pools.cancelDeposit(recipient1, ether('0'), { from: sender1 }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: poolId,
      collectorAddress: pools.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with invalid recipient address', async () => {
    await expectRevert(
      pools.cancelDeposit(constants.ZERO_ADDRESS, ether('1'), {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: poolId,
      collectorAddress: pools.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with maximal uint value', async () => {
    await expectRevert(
      pools.cancelDeposit(recipient1, constants.MAX_UINT256, {
        from: sender1,
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: poolId,
      collectorAddress: pools.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      pools.cancelDeposit(recipient2, ether('1'), { from: sender1 }),
      'The user does not have specified deposit cancel amount.'
    );

    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount2,
      entityId: getEntityId(pools.address, new BN(1)),
      collectorAddress: pools.address,
      senderAddress: sender2,
      recipientAddress: recipient2,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      pools.cancelDeposit(recipient1, amount1.add(ether('1')), {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('fails to cancel a deposit in the pool with required amount collected', async () => {
    const cancelAmount = validatorDepositAmount;
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: cancelAmount,
    });
    await expectRevert(
      pools.cancelDeposit(recipient1, cancelAmount, {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount.sub(amount2),
      entityId: poolId,
      collectorAddress: pools.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance.add(cancelAmount));
  });

  it('fails to cancel a deposit with too small unit', async () => {
    const cancelAmount = amount1.sub(userDepositMinUnit.sub(new BN(1)));
    await expectRevert(
      pools.cancelDeposit(recipient1, cancelAmount, {
        from: sender1,
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: poolId,
      collectorAddress: pools.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, poolsBalance);
    await checkCollectorBalance(pools, poolsBalance);
  });

  it('cancels deposit in full amount', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    const { tx } = await pools.cancelDeposit(recipient1, amount1, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: amount1,
      totalAmount: ether('0'),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(amount1);

    // Check Pools balance
    let expectedBalance = poolsBalance.sub(amount1);
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, expectedBalance);
    await checkCollectorBalance(pools, expectedBalance);
  });

  it('cancels deposit in partial amount', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    const cancelAmount = amount1.sub(userDepositMinUnit);
    const { tx } = await pools.cancelDeposit(recipient1, cancelAmount, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: cancelAmount,
      totalAmount: amount1.sub(cancelAmount),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(cancelAmount);

    // Check Pools balance
    let expectedBalance = poolsBalance.sub(cancelAmount);
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, expectedBalance);
    await checkCollectorBalance(pools, expectedBalance);
  });

  it('cancels deposit partially moved to the next pool', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });

    const cancelAmount = poolsBalance;
    const { tx } = await pools.cancelDeposit(recipient1, cancelAmount, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: getEntityId(pools.address, new BN(2)),
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: cancelAmount,
      totalAmount: new BN(0),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(cancelAmount);

    // Check Pools balance
    await checkPendingPool(pools, poolId, true);
    await checkPendingPool(pools, getEntityId(pools.address, new BN(2)), false);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(
      pools,
      poolsBalance.add(validatorDepositAmount).sub(cancelAmount)
    );
  });
});
