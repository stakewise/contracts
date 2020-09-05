const { expect } = require('chai');
const {
  BN,
  ether,
  constants,
  expectRevert,
  expectEvent,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const {
  getDepositAmount,
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingGroup,
} = require('../utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';
contract('Groups (add deposit)', ([_, ...accounts]) => {
  let networkConfig, groups, settings, groupId, payments;
  let [admin, groupCreator, sender1, sender2, anyone] = accounts;
  let groupMembers = [sender1, sender2];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let {
      groups: groupsProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);

    let receipt = await groups.createGroup(groupMembers, withdrawalPublicKey, {
      from: groupCreator,
    });
    groupId = web3.utils.soliditySha3(groups.address, new BN(1));
    payments = receipt.logs[0].args.payments;
  });

  it('fails to add a deposit with invalid group ID', async () => {
    await expectRevert(
      groups.addDeposit(constants.ZERO_BYTES32, {
        from: sender1,
        value: ether('1'),
      }),
      'Groups: sender is not a member or the group'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('fails to add a deposit without any amount', async () => {
    await expectRevert(
      groups.addDeposit(groupId, {
        from: sender1,
        value: ether('0'),
      }),
      'Groups: invalid deposit amount'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('fails to add a deposit with unit less than minimum', async () => {
    await expectRevert(
      groups.addDeposit(groupId, {
        from: sender1,
        value: validatorDepositAmount.sub(new BN(1)),
      }),
      'Groups: invalid deposit amount'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('fails to add a deposit to paused group', async () => {
    await settings.setContractPaused(groups.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.addDeposit(groupId, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Groups: contract is paused'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('anyone cannot add deposit', async () => {
    await expectRevert(
      groups.addDeposit(groupId, {
        from: anyone,
        value: ether('1'),
      }),
      'Groups: sender is not a member or the group'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('cannot deposit to group which has already collected validator deposit amount', async () => {
    await groups.addDeposit(groupId, {
      from: sender1,
      value: validatorDepositAmount,
    });

    await expectRevert(
      groups.addDeposit(groupId, {
        from: sender1,
        value: ether('1'),
      }),
      'Groups: deposit amount is bigger than amount required to collect'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('cannot deposit amount bigger than validator deposit amount', async () => {
    await expectRevert(
      groups.addDeposit(groupId, {
        from: sender1,
        value: validatorDepositAmount.add(ether('1')),
      }),
      'Groups: deposit amount is bigger than amount required to collect'
    );
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups);
  });

  it('group member can deposit amount smaller than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      max: validatorDepositAmount,
    });
    // Send a deposit
    const receipt = await groups.addDeposit(groupId, {
      from: sender1,
      value: depositAmount,
    });

    // Check deposit added
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      depositAmount
    );
    expectEvent(receipt, 'DepositAdded', {
      groupId,
      sender: sender1,
      amount: depositAmount,
    });

    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: depositAmount,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups, depositAmount);
  });

  it('group manager can add deposit to the group', async () => {
    // Send a first deposit
    const depositAmount1 = getDepositAmount({
      max: validatorDepositAmount,
    });
    let receipt = await groups.addDeposit(groupId, {
      from: sender1,
      value: depositAmount1,
    });

    // Check deposit added
    expect(await groups.depositOf(groupId, sender1)).to.be.bignumber.equal(
      depositAmount1
    );
    expectEvent(receipt, 'DepositAdded', {
      groupId,
      sender: sender1,
      amount: depositAmount1,
    });

    // Send a second deposit
    const depositAmount2 = validatorDepositAmount.sub(depositAmount1);
    receipt = await groups.addDeposit(groupId, {
      from: sender2,
      value: depositAmount2,
    });

    // Check deposit added
    expect(await groups.depositOf(groupId, sender2)).to.be.bignumber.equal(
      depositAmount2
    );
    expectEvent(receipt, 'DepositAdded', {
      groupId,
      sender: sender2,
      amount: depositAmount2,
    });

    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });
});
