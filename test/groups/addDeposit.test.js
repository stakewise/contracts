const {
  BN,
  ether,
  constants,
  expectRevert,
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
  checkDepositAdded,
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingGroup,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Groups = artifacts.require('Groups');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Groups (add deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, groups, groupId;
  let [
    admin,
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
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    groups = await Groups.at(groupsProxy);
    deposits = await Deposits.at(depositsProxy);

    await groups.createGroup(groupMembers, {
      from: groupCreator,
    });
    groupId = getEntityId(groups.address, new BN(1));
  });

  it('fails to add a deposit with invalid recipient address', async () => {
    await expectRevert(
      groups.addDeposit(groupId, constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'Invalid recipient address.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('fails to add a deposit with invalid group ID', async () => {
    await expectRevert(
      groups.addDeposit(constants.ZERO_BYTES32, recipient1, {
        from: sender1,
        value: ether('1'),
      }),
      'The sender is not a member of the group with the specified ID.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('fails to add a deposit without any amount', async () => {
    await expectRevert(
      groups.addDeposit(groupId, recipient1, {
        from: sender1,
        value: ether('0'),
      }),
      'Invalid deposit amount.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('fails to add a deposit with unit less than minimal', async () => {
    await expectRevert(
      groups.addDeposit(groupId, recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(new BN(1)),
      }),
      'Invalid deposit amount.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('not registered group member cannot add deposit', async () => {
    await expectRevert(
      groups.addDeposit(groupId, recipient1, {
        from: recipient1,
        value: ether('1'),
      }),
      'The sender is not a member of the group with the specified ID.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('cannot deposit to group which has already collected validator deposit amount', async () => {
    await groups.addDeposit(groupId, recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });

    await expectRevert(
      groups.addDeposit(groupId, recipient1, {
        from: sender1,
        value: ether('1'),
      }),
      'The deposit amount is bigger than the amount required to collect.'
    );
    await checkPendingGroup(groups, groupId, validatorDepositAmount);
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('cannot deposit amount bigger than validator deposit amount', async () => {
    await expectRevert(
      groups.addDeposit(groupId, recipient1, {
        from: sender1,
        value: validatorDepositAmount.add(ether('1')),
      }),
      'The deposit amount is bigger than the amount required to collect.'
    );
    await checkPendingGroup(groups, groupId, new BN(0));
    await checkCollectorBalance(groups, new BN(0));
  });

  it('adds a deposit smaller than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      max: validatorDepositAmount,
    });
    // Send a deposit
    const { tx } = await groups.addDeposit(groupId, recipient1, {
      from: sender1,
      value: depositAmount,
    });

    // Check deposit added to Deposits contract
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: depositAmount,
      totalAmount: depositAmount,
    });

    await checkPendingGroup(groups, groupId, depositAmount);
    await checkCollectorBalance(groups, depositAmount);
  });

  it('group creator can add deposit to the group', async () => {
    // Send a first deposit
    const depositAmount1 = getDepositAmount({
      max: validatorDepositAmount,
    });
    const { tx: tx1 } = await groups.addDeposit(groupId, recipient1, {
      from: groupCreator,
      value: depositAmount1,
    });

    // Check deposit added to Deposits contract
    await checkDepositAdded({
      transaction: tx1,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: groupCreator,
      recipientAddress: recipient1,
      addedAmount: depositAmount1,
      totalAmount: depositAmount1,
    });

    // Send a second deposit
    const depositAmount2 = validatorDepositAmount.sub(depositAmount1);
    const { tx: tx2 } = await groups.addDeposit(groupId, recipient2, {
      from: sender2,
      value: depositAmount2,
    });

    // Check deposit added to Deposits contract
    await checkDepositAdded({
      transaction: tx2,
      depositsContract: deposits,
      collectorAddress: groups.address,
      entityId: groupId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      addedAmount: depositAmount2,
      totalAmount: depositAmount2,
    });

    await checkPendingGroup(groups, groupId, validatorDepositAmount);
    await checkCollectorBalance(groups, validatorDepositAmount);
  });
});
