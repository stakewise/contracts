const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  expectEvent,
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
  checkCollectorBalance,
  checkPendingGroup,
  getEntityId,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';
const signature =
  '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b';
const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';
const depositDataRoot =
  '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f';
const minDepositUnit = new BN(initialSettings.minDepositUnit);

contract('Groups (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    dai,
    groups,
    amount1,
    amount2,
    groupBalance,
    groupId,
    payments;
  let [admin, operator, sender1, sender2, groupCreator] = accounts;
  let groupMembers = [sender1, sender2];

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
    let {
      groups: groupsProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    groups = await Groups.at(groupsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new group
    let receipt = await groups.createGroup(groupMembers, withdrawalPublicKey, {
      from: groupCreator,
    });
    groupId = getEntityId(groups.address, new BN(1));
    payments = receipt.logs[0].args.payments;

    amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await groups.addDeposit(groupId, {
      from: sender1,
      value: amount1,
    });

    amount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await groups.addDeposit(groupId, {
      from: sender2,
      value: amount2,
    });
    groupBalance = amount1.add(amount2);
  });

  it('fails to cancel a deposit with invalid cancel amount', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, ether('0'), { from: sender1 }),
      'Groups: invalid deposit cancel amount'
    );
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      amount1
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: groupBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit with invalid group ID', async () => {
    await expectRevert(
      groups.cancelDeposit(constants.ZERO_BYTES32, amount1, { from: sender1 }),
      'Groups: deposit cancel amount exceeds balance'
    );
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      amount1
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: groupBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      groups.cancelDeposit(groupId, amount1.add(ether('1')), {
        from: sender1,
      }),
      'Groups: deposit cancel amount exceeds balance'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: groupBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, groupBalance);
  });

  it('fails to cancel deposit amount twice', async () => {
    await groups.cancelDeposit(groupId, amount1, {
      from: sender1,
    });
    await expectRevert(
      groups.cancelDeposit(groupId, amount1, {
        from: sender1,
      }),
      'Groups: deposit cancel amount exceeds balance'
    );
    let expectedBalance = groupBalance.sub(amount1);
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: expectedBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, expectedBalance);
  });

  it('fails to cancel a deposit from group with registered validator', async () => {
    const cancelAmount = validatorDepositAmount.sub(groupBalance);
    await groups.addDeposit(groupId, {
      from: sender1,
      value: cancelAmount,
    });

    await groups.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      groupId,
      {
        from: operator,
      }
    );

    await expectRevert(
      groups.cancelDeposit(groupId, cancelAmount, {
        from: sender1,
      }),
      'Groups: invalid group ID'
    );
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      amount1.add(cancelAmount)
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);
  });

  it('fails to cancel a deposit with too small unit', async () => {
    const cancelAmount = amount1.sub(minDepositUnit.sub(new BN(1)));
    await expectRevert(
      groups.cancelDeposit(groupId, cancelAmount, {
        from: sender1,
      }),
      'Groups: invalid deposit cancel amount'
    );
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      amount1
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: groupBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, groupBalance);
  });

  it('cancels deposit in full amount', async () => {
    // sender1 cancels deposit
    let prevBalance = await balance.current(sender1);
    let receipt = await groups.cancelDeposit(groupId, amount1, {
      from: sender1,
    });
    expectEvent(receipt, 'DepositCanceled', {
      groupId,
      sender: sender1,
      amount: amount1,
    });
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal('0');

    // Check balance changed
    expect(prevBalance < (await balance.current(sender1))).to.be.equal(true);

    let expectedBalance = groupBalance.sub(amount1);
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: expectedBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, expectedBalance);

    // sender2 cancels deposit
    prevBalance = await balance.current(sender2);
    receipt = await groups.cancelDeposit(groupId, amount2, {
      from: sender2,
    });
    expectEvent(receipt, 'DepositCanceled', {
      groupId,
      sender: sender2,
      amount: amount2,
    });
    expect(await groups.depositOf(groupId, sender2)).to.be.bignumber.equal('0');

    // Check balance changed
    expect(prevBalance < (await balance.current(sender2))).to.be.equal(true);
    await checkPendingGroup({
      groups,
      groupId,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups);
  });

  it('cancels deposit in partial amount', async () => {
    // sender1 cancels deposit
    let prevBalance = await balance.current(sender1);
    let cancelAmount = amount1.sub(minDepositUnit);
    let receipt = await groups.cancelDeposit(groupId, cancelAmount, {
      from: sender1,
    });
    expectEvent(receipt, 'DepositCanceled', {
      groupId,
      sender: sender1,
      amount: cancelAmount,
    });
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      amount1.sub(cancelAmount)
    );

    // Check balance changed
    expect(prevBalance < (await balance.current(sender1))).to.be.equal(true);

    let expectedBalance = groupBalance.sub(cancelAmount);
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: expectedBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, expectedBalance);

    // sender2 cancels deposit
    prevBalance = await balance.current(sender2);
    cancelAmount = amount2.sub(minDepositUnit);
    receipt = await groups.cancelDeposit(groupId, cancelAmount, {
      from: sender2,
    });
    expectEvent(receipt, 'DepositCanceled', {
      groupId,
      sender: sender2,
      amount: cancelAmount,
    });
    expect(await groups.depositOf(groupId, sender2)).to.be.bignumber.equal(
      amount2.sub(cancelAmount)
    );

    // Check balance changed
    expect(prevBalance < (await balance.current(sender2))).to.be.equal(true);

    expectedBalance = expectedBalance.sub(cancelAmount);
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: expectedBalance,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, expectedBalance);
  });
});
