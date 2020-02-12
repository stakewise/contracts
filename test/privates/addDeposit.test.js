const {
  BN,
  ether,
  constants,
  expectRevert
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  checkDepositAdded,
  removeNetworkFile,
  checkCollectorBalance
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Privates = artifacts.require('Privates');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Privates (add deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, privates, settings;
  let [admin, sender1, withdrawer1, sender2, withdrawer2] = accounts;

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
      privates: privatesProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    privates = await Privates.at(privatesProxy);
    deposits = await Deposits.at(depositsProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to add a deposit with zero withdrawer address', async () => {
    await expectRevert(
      privates.addDeposit(constants.ZERO_ADDRESS, {
        from: sender1
      }),
      'Withdrawer address cannot be zero address.'
    );
    await checkCollectorBalance(privates, new BN(0));
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      privates.addDeposit(withdrawer1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1'))
      }),
      'Invalid deposit amount.'
    );
    await checkCollectorBalance(privates, new BN(0));
  });

  it('fails to add a deposit bigger than validator deposit amount', async () => {
    await expectRevert(
      privates.addDeposit(withdrawer1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1'))
      }),
      'Invalid deposit amount.'
    );
    await checkCollectorBalance(privates, new BN(0));
  });

  it('adds a deposit equal to validator deposit amount', async () => {
    // Send a deposit
    const { tx } = await privates.addDeposit(withdrawer1, {
      from: sender1,
      value: validatorDepositAmount
    });

    // Check private deposit added
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: privates.address,
      entityId: new BN(1),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount
    });

    // Check contract balance
    await checkCollectorBalance(privates, validatorDepositAmount);
  });

  it('adds deposits for different users', async () => {
    let tx;

    // User 1 creates a deposit
    ({ tx } = await privates.addDeposit(withdrawer1, {
      from: sender1,
      value: validatorDepositAmount
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: privates.address,
      entityId: new BN(1),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount
    });

    // User 2 creates a deposit
    ({ tx } = await privates.addDeposit(withdrawer2, {
      from: sender2,
      value: validatorDepositAmount
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: privates.address,
      entityId: new BN(2),
      senderAddress: sender2,
      withdrawerAddress: withdrawer2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount
    });

    // Check contract balance
    await checkCollectorBalance(
      privates,
      validatorDepositAmount.mul(new BN(2))
    );
  });

  it('counts two deposits from the same user as different ones', async () => {
    let tx;

    // User 1 creates a first deposit
    ({ tx } = await privates.addDeposit(withdrawer1, {
      from: sender1,
      value: validatorDepositAmount
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: privates.address,
      entityId: new BN(1),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount
    });

    // User 1 creates a second deposit
    ({ tx } = await privates.addDeposit(withdrawer1, {
      from: sender1,
      value: validatorDepositAmount
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: privates.address,
      entityId: new BN(2),
      senderAddress: sender1,
      withdrawerAddress: withdrawer1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount
    });

    // Check contract balance
    await checkCollectorBalance(
      privates,
      validatorDepositAmount.mul(new BN(2))
    );
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setCollectorPaused(privates.address, true, {
      from: admin
    });
    expect(await settings.pausedCollectors(privates.address)).equal(true);

    await expectRevert(
      privates.addDeposit(withdrawer1, {
        from: sender1,
        value: validatorDepositAmount
      }),
      'Depositing is currently disabled.'
    );
    await checkCollectorBalance(privates, new BN(0));
  });
});
