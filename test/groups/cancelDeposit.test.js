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
const { deployVRC } = require('../../deployments/vrc');
const {
  getDepositAmount,
  removeNetworkFile,
  checkUserTotalAmount,
  checkCollectorBalance,
  checkPendingGroup,
  checkDepositCanceled,
  getEntityId,
  validatorRegistrationArgs,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');

const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const userDepositMinUnit = new BN(initialSettings.userDepositMinUnit);

contract('Groups (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig,
    deposits,
    vrc,
    groups,
    amount1,
    amount2,
    groupBalance,
    groupId;
  let [
    admin,
    operator,
    groupCreator,
    sender1,
    recipient1,
    sender2,
    recipient2,
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
      groups: groupsProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    groups = await Groups.at(groupsProxy);
    deposits = await Deposits.at(depositsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new group
    await groups.createGroup(groupMembers, {
      from: groupCreator,
    });

    groupId = getEntityId(groups.address, new BN(1));

    amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await groups.addDeposit(groupId, recipient1, {
      from: sender1,
      value: amount1,
    });

    amount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await groups.addDeposit(groupId, recipient2, {
      from: sender2,
      value: amount2,
    });
    groupBalance = amount1.add(amount2);
  });

  it('fails to cancel a deposit with invalid cancel amount', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, ether('0'), { from: sender1 }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit with invalid recipient address', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, constants.ZERO_ADDRESS, ether('1'), {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit with maximal uint value', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, constants.MAX_UINT256, {
        from: sender1,
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, recipient2, ether('1'), { from: sender1 }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount2,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender2,
      recipientAddress: recipient2,
    });
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, amount1.add(ether('1')), {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel deposit amount twice', async () => {
    await groups.cancelDeposit(groupId, recipient1, amount1, {
      from: sender1,
    });
    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, amount1, {
        from: sender1,
      }),
      'The user does not have specified deposit cancel amount.'
    );
    let expectedBalance = groupBalance.sub(amount1);
    await checkPendingGroup(groups, groupId, expectedBalance);
    await checkCollectorBalance(groups, expectedBalance);
  });

  it('fails to cancel a deposit from group with registered validator', async () => {
    const cancelAmount = validatorDepositAmount.sub(groupBalance);
    await groups.addDeposit(groupId, recipient1, {
      from: sender1,
      value: cancelAmount,
    });

    await groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
      from: operator,
    });

    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, cancelAmount, {
        from: sender1,
      }),
      'Cannot cancel deposit from group which has started staking.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1.add(cancelAmount),
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('fails to cancel a deposit with too small unit', async () => {
    const cancelAmount = amount1.sub(userDepositMinUnit.sub(new BN(1)));
    await expectRevert(
      groups.cancelDeposit(groupId, recipient1, cancelAmount, {
        from: sender1,
      }),
      'Invalid deposit cancel amount.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: amount1,
      entityId: groupId,
      collectorAddress: groups.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingGroup(groups, groupId, groupBalance);
    await checkCollectorBalance(groups, groupBalance);
  });

  it('cancels deposit in full amount', async () => {
    // sender1 cancels deposit
    let recipientBalance = await balance.tracker(recipient1);
    let { tx } = await groups.cancelDeposit(groupId, recipient1, amount1, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: amount1,
      totalAmount: ether('0'),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(amount1);

    let expectedBalance = groupBalance.sub(amount1);
    await checkPendingGroup(groups, groupId, expectedBalance);
    await checkCollectorBalance(groups, expectedBalance);

    // sender2 cancels deposit
    recipientBalance = await balance.tracker(recipient2);
    ({ tx } = await groups.cancelDeposit(groupId, recipient2, amount2, {
      from: sender2,
    }));
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      canceledAmount: amount2,
      totalAmount: ether('0'),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(amount2);
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('cancels deposit in partial amount', async () => {
    // sender1 cancels deposit
    let recipientBalance = await balance.tracker(recipient1);
    let cancelAmount = amount1.sub(userDepositMinUnit);
    let { tx } = await groups.cancelDeposit(groupId, recipient1, cancelAmount, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: cancelAmount,
      totalAmount: amount1.sub(cancelAmount),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(cancelAmount);

    let expectedBalance = groupBalance.sub(cancelAmount);
    await checkPendingGroup(groups, groupId, expectedBalance);
    await checkCollectorBalance(groups, expectedBalance);

    // sender2 cancels deposit
    recipientBalance = await balance.tracker(recipient2);
    cancelAmount = amount2.sub(userDepositMinUnit);
    ({ tx } = await groups.cancelDeposit(groupId, recipient2, cancelAmount, {
      from: sender2,
    }));
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      canceledAmount: cancelAmount,
      totalAmount: amount2.sub(cancelAmount),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(cancelAmount);

    expectedBalance = expectedBalance.sub(cancelAmount);
    await checkPendingGroup(groups, groupId, expectedBalance);
    await checkCollectorBalance(groups, expectedBalance);
  });
});
