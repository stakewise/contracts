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
  checkDepositCanceled,
  getEntityId
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Groups = artifacts.require('Groups');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const userDepositMinUnit = new BN(initialSettings.userDepositMinUnit);

contract('Groups (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig,
    deposits,
    vrc,
    groups,
    amount1,
    amount2,
    groupsBalance,
    groupId;
  let [
    admin,
    groupCreator,
    sender1,
    withdrawer1,
    sender2,
    withdrawer2
  ] = accounts;
  let groupMembers = [sender1, sender2];

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
      deposits: depositsProxy,
      groups: groupsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    groups = await Groups.at(groupsProxy);
    deposits = await Deposits.at(depositsProxy);

    // create new group
    await groups.createGroup(groupMembers, {
      from: groupCreator
    });

    groupId = getEntityId(groups.address, new BN(1));

    amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    await groups.addDeposit(groupId, withdrawer1, {
      from: sender1,
      value: amount1
    });

    amount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    await groups.addDeposit(groupId, withdrawer2, {
      from: sender2,
      value: amount2
    });
    groupsBalance = amount1.add(amount2);
  });

  it('fails to cancel a deposit with invalid cancel amount', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer1, ether('0'), { from: sender1 }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('fails to cancel a deposit with invalid withdrawer address', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, constants.ZERO_ADDRESS, ether('1'), {
        from: sender1
      }),
      'The user does not have a specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('fails to cancel a deposit with maximal uint value', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer1, constants.MAX_UINT256, {
        from: sender1
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer2, ether('1'), { from: sender1 }),
      'The user does not have a specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount2,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender2,
      withdrawerAddress: withdrawer2
    });
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer1, amount1.add(ether('1')), {
        from: sender1
      }),
      'The user does not have a specified deposit cancel amount.'
    );
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('fails to cancel a deposit located in the ready group', async () => {
    const cancelAmount = validatorDepositAmount.sub(groupsBalance);
    await groups.addDeposit(groupId, withdrawer1, {
      from: sender1,
      value: cancelAmount
    });
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer1, cancelAmount, {
        from: sender1
      }),
      'Cannot cancel the deposit amount of the group which has collected a validator deposit amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1.add(cancelAmount),
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(groups, validatorDepositAmount);

    let group = await groups.groups(groupId);
    expect(group.collectedAmount).to.be.bignumber.equal(validatorDepositAmount);
    expect(group.targetAmountCollected).to.be.equal(true);
  });

  it('fails to cancel a deposit with too small unit', async () => {
    const cancelAmount = amount1.sub(userDepositMinUnit.sub(new BN(1)));
    await expectRevert(
      groups.cancelDeposit(groupId, withdrawer1, cancelAmount, {
        from: sender1
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1
    });
    await checkCollectorBalance(groups, groupsBalance);
  });

  it('cancels deposit in full amount', async () => {
    const withdrawerBalance = await balance.tracker(withdrawer1);
    const { tx } = await groups.cancelDeposit(groupId, withdrawer1, amount1, {
      from: sender1
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      canceledAmount: amount1,
      totalAmount: ether('0')
    });

    // Check withdrawer balance changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(amount1);

    // Check Groups balance
    await checkCollectorBalance(groups, groupsBalance.sub(amount1));

    let group = await groups.groups(groupId);
    expect(group.collectedAmount).to.be.bignumber.equal(
      groupsBalance.sub(amount1)
    );
    expect(group.targetAmountCollected).to.be.equal(false);
  });

  it('cancels deposit in partial amount', async () => {
    const withdrawerBalance = await balance.tracker(withdrawer1);
    const cancelAmount = amount1.sub(userDepositMinUnit);
    const { tx } = await groups.cancelDeposit(
      groupId,
      withdrawer1,
      cancelAmount,
      {
        from: sender1
      }
    );
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      canceledAmount: cancelAmount,
      totalAmount: amount1.sub(cancelAmount)
    });

    // Check withdrawer balance changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(cancelAmount);

    // Check Groups balance
    await checkCollectorBalance(groups, groupsBalance.sub(cancelAmount));

    let group = await groups.groups(groupId);
    expect(group.collectedAmount).to.be.bignumber.equal(
      groupsBalance.sub(cancelAmount)
    );
    expect(group.targetAmountCollected).to.be.equal(false);
  });
});
