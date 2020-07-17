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
const { deployVRC } = require('../../deployments/vrc');
const {
  checkDepositAdded,
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingSolo,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Solos = artifacts.require('Solos');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Solos (add private deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, solos, settings, soloId;
  let [admin, sender1, sender2] = accounts;

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
      solos: solosProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    solos = await Solos.at(solosProxy);
    deposits = await Deposits.at(depositsProxy);
    settings = await Settings.at(settingsProxy);

    soloId = getEntityId(solos.address, new BN(1));
  });

  it('fails to add a deposit with an invalid withdrawal public key', async () => {
    await expectRevert(
      solos.addPrivateDeposit(constants.ZERO_BYTES32, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Invalid BLS withdrawal public key.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setContractPaused(solos.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(solos.address)).equal(true);

    await expectRevert(
      solos.addPrivateDeposit(withdrawalPublicKey, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Depositing is currently disabled.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      solos.addPrivateDeposit(withdrawalPublicKey, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit not divisible by validator deposit amount', async () => {
    await expectRevert(
      solos.addPrivateDeposit(withdrawalPublicKey, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('adds deposits divisible by validator deposit amount', async () => {
    // Send a deposit
    const receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount.mul(new BN(3)),
    });

    for (let i = 1; i < 4; i++) {
      // Check solo deposit added
      let soloId = getEntityId(solos.address, new BN(i));
      await checkDepositAdded({
        transaction: receipt.tx,
        depositsContract: deposits,
        collectorAddress: solos.address,
        entityId: soloId,
        senderAddress: sender1,
        recipientAddress: sender1,
        addedAmount: validatorDepositAmount,
        totalAmount: validatorDepositAmount,
      });
    }
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(3)));
  });

  it('adds a deposit equal to validator deposit amount', async () => {
    // Send a deposit
    let receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check private solo deposit added
    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: sender1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });

    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: sender1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // User 2 creates a deposit
    receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender2,
      value: validatorDepositAmount,
    });

    soloId = getEntityId(solos.address, new BN(2));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender2,
      recipientAddress: sender2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender2,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('counts two deposits from the same user as different ones', async () => {
    // User 1 creates a first deposit
    let receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });

    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: sender1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });

    // User 1 creates a second deposit
    soloId = getEntityId(solos.address, new BN(2));
    receipt = await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });

    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: sender1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: soloId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });

    // Check contract balance
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });
});
