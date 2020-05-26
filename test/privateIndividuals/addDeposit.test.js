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
  checkValidatorDepositData,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const PrivateIndividuals = artifacts.require('PrivateIndividuals');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Private Individuals (add deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, individuals, settings, individualId;
  let [admin, sender1, recipient1, sender2, recipient2] = accounts;

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
      privateIndividuals: individualsProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    individuals = await PrivateIndividuals.at(individualsProxy);
    deposits = await Deposits.at(depositsProxy);
    settings = await Settings.at(settingsProxy);

    individualId = getEntityId(individuals.address, new BN(1));
  });

  it('fails to add a deposit with an invalid recipient address', async () => {
    await expectRevert(
      individuals.addDeposit(withdrawalPublicKey, constants.ZERO_ADDRESS, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Invalid recipient address.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit with an invalid withdrawal public key', async () => {
    await expectRevert(
      individuals.addDeposit(constants.ZERO_BYTES32, recipient1, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Invalid BLS withdrawal public key.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      individuals.addDeposit(withdrawalPublicKey, recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit bigger than validator deposit amount', async () => {
    await expectRevert(
      individuals.addDeposit(withdrawalPublicKey, recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setContractPaused(individuals.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(individuals.address)).equal(true);

    await expectRevert(
      individuals.addDeposit(withdrawalPublicKey, recipient1, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Depositing is currently disabled.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('adds a deposit equal to validator deposit amount', async () => {
    // Send a deposit
    let receipt = await individuals.addDeposit(
      withdrawalPublicKey,
      recipient1,
      {
        from: sender1,
        value: validatorDepositAmount,
      }
    );

    // Check private individual deposit added
    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: individualId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let receipt = await individuals.addDeposit(
      withdrawalPublicKey,
      recipient1,
      {
        from: sender1,
        value: validatorDepositAmount,
      }
    );

    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: individualId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(individuals, validatorDepositAmount);

    // User 2 creates a deposit
    receipt = await individuals.addDeposit(withdrawalPublicKey, recipient2, {
      from: sender2,
      value: validatorDepositAmount,
    });

    individualId = getEntityId(individuals.address, new BN(2));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: individualId,
      manager: sender2,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(
      individuals,
      validatorDepositAmount.mul(new BN(2))
    );
  });

  it('counts two deposits from the same user as different ones', async () => {
    // User 1 creates a first deposit
    let receipt = await individuals.addDeposit(
      withdrawalPublicKey,
      recipient1,
      {
        from: sender1,
        value: validatorDepositAmount,
      }
    );

    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: individualId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });

    // User 1 creates a second deposit
    individualId = getEntityId(individuals.address, new BN(2));
    receipt = await individuals.addDeposit(withdrawalPublicKey, recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });

    await checkDepositAdded({
      transaction: receipt.tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // check validator deposit withdrawal key added
    expectEvent(receipt, 'WithdrawalKeyAdded', {
      entityId: individualId,
      manager: sender1,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });

    // Check contract balance
    await checkCollectorBalance(
      individuals,
      validatorDepositAmount.mul(new BN(2))
    );
  });
});
