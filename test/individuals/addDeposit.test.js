const { expect } = require('chai');
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
  checkDepositAdded,
  removeNetworkFile,
  checkCollectorBalance,
  checkIndividualManager,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Individuals = artifacts.require('Individuals');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Individuals (add deposit)', ([_, ...accounts]) => {
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
      individuals: individualsProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    individuals = await Individuals.at(individualsProxy);
    deposits = await Deposits.at(depositsProxy);
    settings = await Settings.at(settingsProxy);

    individualId = getEntityId(individuals.address, new BN(1));
  });

  it('fails to add a deposit with an invalid recipient address', async () => {
    await expectRevert(
      individuals.addDeposit(constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'Invalid recipient address.'
    );
    await checkIndividualManager(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      individuals.addDeposit(recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkIndividualManager(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('fails to add a deposit bigger than validator deposit amount', async () => {
    await expectRevert(
      individuals.addDeposit(recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkIndividualManager(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('adds a deposit equal to validator deposit amount', async () => {
    // Send a deposit
    const { tx } = await individuals.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check individual deposit added
    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkIndividualManager(individuals, individualId, sender1);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('adds deposits for different users', async () => {
    let tx;

    // User 1 creates a deposit
    ({ tx } = await individuals.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkIndividualManager(individuals, individualId, sender1);

    // User 2 creates a deposit
    ({ tx } = await individuals.addDeposit(recipient2, {
      from: sender2,
      value: validatorDepositAmount,
    }));
    individualId = getEntityId(individuals.address, new BN(2));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkIndividualManager(individuals, individualId, sender2);

    // Check contract balance
    await checkCollectorBalance(
      individuals,
      validatorDepositAmount.mul(new BN(2))
    );
  });

  it('counts two deposits from the same user as different ones', async () => {
    let tx;

    // User 1 creates a first deposit
    ({ tx } = await individuals.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    let individualId = getEntityId(individuals.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkIndividualManager(individuals, individualId, sender1);

    // User 1 creates a second deposit
    individualId = getEntityId(individuals.address, new BN(2));
    ({ tx } = await individuals.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkIndividualManager(individuals, individualId, sender1);

    // Check contract balance
    await checkCollectorBalance(
      individuals,
      validatorDepositAmount.mul(new BN(2))
    );
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setContractPaused(individuals.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(individuals.address)).equal(true);

    await expectRevert(
      individuals.addDeposit(recipient1, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Depositing is currently disabled.'
    );
    await checkCollectorBalance(individuals);
    await checkIndividualManager(individuals, individualId);
  });
});
