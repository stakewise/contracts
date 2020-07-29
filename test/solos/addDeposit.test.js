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
  checkPendingSolo,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Solos = artifacts.require('Solos');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Solos (add deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, solos, settings;
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
  });

  it('fails to add a deposit with an invalid recipient address', async () => {
    await expectRevert(
      solos.addDeposit(constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'Invalid recipient address.'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit not divisible by validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1')),
      }),
      'Invalid deposit amount.'
    );
    await checkCollectorBalance(solos);
  });

  it('adds a deposit equal to validator deposit amount', async () => {
    // Send a deposit
    const { tx } = await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('adds deposits divisible by validator deposit amount', async () => {
    // Send a deposit
    const { tx } = await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount.mul(new BN(3)),
    });

    for (let i = 1; i < 4; i++) {
      // Check solo deposit added
      let soloId = getEntityId(solos.address, new BN(i));
      await checkDepositAdded({
        transaction: tx,
        depositsContract: deposits,
        collectorAddress: solos.address,
        entityId: soloId,
        senderAddress: sender1,
        recipientAddress: recipient1,
        addedAmount: validatorDepositAmount,
        totalAmount: validatorDepositAmount,
      });
      await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
    }
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(3)));
  });

  it('adds deposits for different users', async () => {
    let tx;

    // User 1 creates a deposit
    ({ tx } = await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });

    // User 2 creates a deposit
    ({ tx } = await solos.addDeposit(recipient2, {
      from: sender2,
      value: validatorDepositAmount,
    }));
    soloId = getEntityId(solos.address, new BN(2));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });

    // Check contract balance
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('counts two deposits from the same user as different ones', async () => {
    let tx;

    // User 1 creates a first deposit
    ({ tx } = await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    let soloId = getEntityId(solos.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });

    // User 1 creates a second deposit
    soloId = getEntityId(solos.address, new BN(2));
    ({ tx } = await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });

    // Check contract balance
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setContractPaused(solos.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(solos.address)).equal(true);

    await expectRevert(
      solos.addDeposit(recipient1, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Depositing is currently disabled.'
    );
    await checkCollectorBalance(solos);
  });
});
