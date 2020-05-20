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
  getDepositAmount,
  checkDepositAdded,
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingPool,
  checkNewPoolCollectedAmount,
  getEntityId,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Pools = artifacts.require('Pools');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Pools (add deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, pools, settings;
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
      pools: poolsProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    pools = await Pools.at(poolsProxy);
    deposits = await Deposits.at(depositsProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to add a deposit with zero recipient address', async () => {
    await expectRevert(
      pools.addDeposit(constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'Invalid recipient address.'
    );
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, new BN(0));
  });

  it('fails to add a deposit with zero amount', async () => {
    await expectRevert(
      pools.addDeposit(recipient1, {
        from: sender1,
        value: ether('0'),
      }),
      'Invalid deposit amount.'
    );
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, new BN(0));
  });

  it('fails to add a deposit with unit less than minimal', async () => {
    await expectRevert(
      pools.addDeposit(recipient1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(new BN(1)),
      }),
      'Invalid deposit amount.'
    );
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, new BN(0));
  });

  it('adds a deposit smaller than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      max: validatorDepositAmount,
    });
    // Send a deposit
    const { tx } = await pools.addDeposit(recipient1, {
      from: sender1,
      value: depositAmount,
    });

    // Check deposit added to Deposits contract
    let poolId = getEntityId(pools.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: depositAmount,
      totalAmount: depositAmount,
    });

    await checkNewPoolCollectedAmount(pools, depositAmount);
    await checkPendingPool(pools, poolId, false);
    await checkCollectorBalance(pools, depositAmount);
  });

  it('adds a deposit bigger than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      min: validatorDepositAmount,
      max: validatorDepositAmount.mul(new BN(2)),
    });

    // Send a deposit
    const { tx } = await pools.addDeposit(recipient1, {
      from: sender1,
      value: depositAmount,
    });

    // Check added to the pool 1
    let poolId = getEntityId(pools.address, new BN(1));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkPendingPool(pools, poolId, true);

    // Check added to the pool 2
    poolId = getEntityId(pools.address, new BN(2));
    let expectedAmount = depositAmount.sub(validatorDepositAmount);
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: expectedAmount,
      totalAmount: expectedAmount,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, expectedAmount);

    // Check contract balance
    await checkCollectorBalance(pools, depositAmount);
  });

  it('adds deposits for different users', async () => {
    let tx;
    let poolId = getEntityId(pools.address, new BN(1));

    // User 1 creates a deposit
    let depositAmount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    ({ tx } = await pools.addDeposit(recipient1, {
      from: sender1,
      value: depositAmount1,
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      addedAmount: depositAmount1,
      totalAmount: depositAmount1,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, depositAmount1);

    // User 2 creates a deposit
    let depositAmount2 = validatorDepositAmount.sub(depositAmount1);
    ({ tx } = await pools.addDeposit(recipient2, {
      from: sender2,
      value: depositAmount2,
    }));
    await checkDepositAdded({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: pools.address,
      entityId: poolId,
      senderAddress: sender2,
      recipientAddress: recipient2,
      addedAmount: depositAmount2,
      totalAmount: depositAmount2,
    });

    // check contract balance
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('increases deposit amount in pool', async () => {
    let userBalance = new BN(0);
    let poolId = getEntityId(pools.address, new BN(1));
    for (let i = 0; i < 16; i++) {
      // User creates a deposit
      let depositAmount = getDepositAmount({
        max: validatorDepositAmount.div(new BN(16)),
      });
      let { tx } = await pools.addDeposit(recipient1, {
        from: sender1,
        value: depositAmount,
      });
      userBalance.iadd(depositAmount);
      await checkDepositAdded({
        transaction: tx,
        depositsContract: deposits,
        collectorAddress: pools.address,
        entityId: poolId,
        senderAddress: sender1,
        recipientAddress: recipient1,
        addedAmount: depositAmount,
        totalAmount: userBalance,
      });
      // Check contract balance updated
      await checkCollectorBalance(pools, userBalance);
    }
    if (userBalance.eq(validatorDepositAmount)) {
      await checkPendingPool(pools, poolId, true);
      await checkNewPoolCollectedAmount(pools, new BN(0));
    } else {
      await checkPendingPool(pools, poolId, false);
      await checkNewPoolCollectedAmount(pools, userBalance);
    }
  });

  it('splits deposit amount if it goes to different pools', async () => {
    let poolId1 = getEntityId(pools.address, new BN(1));
    let balance1 = new BN(0);

    let poolId2 = getEntityId(pools.address, new BN(2));
    let balance2 = new BN(0);

    for (let i = 0; i < 16; i++) {
      // Create a deposit
      let depositAmount = getDepositAmount({
        min: validatorDepositAmount.div(new BN(16)).add(new BN(1)),
        max: validatorDepositAmount.div(new BN(8)),
      });
      const { tx } = await pools.addDeposit(recipient1, {
        from: sender1,
        value: depositAmount,
      });

      if (balance1.add(depositAmount).lte(validatorDepositAmount)) {
        // Deposit goes to pool 1
        balance1.iadd(depositAmount);
        await checkDepositAdded({
          transaction: tx,
          depositsContract: deposits,
          collectorAddress: pools.address,
          entityId: poolId1,
          senderAddress: sender1,
          recipientAddress: recipient1,
          addedAmount: depositAmount,
          totalAmount: balance1,
        });

        // check pending pools registry
        if (balance1.eq(validatorDepositAmount)) {
          await checkPendingPool(pools, poolId1, true);
          await checkNewPoolCollectedAmount(pools, new BN(0));
        } else {
          await checkPendingPool(pools, poolId1, false);
          await checkNewPoolCollectedAmount(pools, balance1);
        }
      } else if (balance1.eq(validatorDepositAmount)) {
        // Deposit goes to pool 2
        balance2.iadd(depositAmount);
        await checkDepositAdded({
          transaction: tx,
          depositsContract: deposits,
          collectorAddress: pools.address,
          entityId: poolId2,
          senderAddress: sender1,
          recipientAddress: recipient1,
          addedAmount: depositAmount,
          totalAmount: balance2,
        });

        // check pending pools registry
        await checkPendingPool(pools, poolId1, true);
        if (balance2.eq(validatorDepositAmount)) {
          await checkPendingPool(pools, poolId2, true);
          await checkNewPoolCollectedAmount(pools, new BN(0));
        } else {
          await checkPendingPool(pools, poolId2, false);
          await checkNewPoolCollectedAmount(pools, balance2);
        }
      } else {
        // Deposit was split between pool 1 and 2
        const toPool1 = validatorDepositAmount.sub(balance1);
        balance1.iadd(toPool1);
        await checkDepositAdded({
          transaction: tx,
          depositsContract: deposits,
          collectorAddress: pools.address,
          entityId: getEntityId(pools.address, new BN(1)),
          senderAddress: sender1,
          recipientAddress: recipient1,
          addedAmount: toPool1,
          totalAmount: balance1,
        });

        const toPool2 = depositAmount.sub(toPool1);
        balance2.iadd(toPool2);
        await checkDepositAdded({
          transaction: tx,
          depositsContract: deposits,
          collectorAddress: pools.address,
          entityId: getEntityId(pools.address, new BN(2)),
          senderAddress: sender1,
          recipientAddress: recipient1,
          addedAmount: toPool2,
          totalAmount: balance2,
        });

        // check pending pools registry
        await checkPendingPool(pools, poolId1, true);
        if (balance2.eq(validatorDepositAmount)) {
          await checkPendingPool(pools, poolId2, true);
          await checkNewPoolCollectedAmount(pools, new BN(0));
        } else {
          await checkPendingPool(pools, poolId2, false);
          await checkNewPoolCollectedAmount(pools, balance2);
        }
      }

      // Check contract balance
      await checkCollectorBalance(pools, balance1.add(balance2));
    }
  });

  it('fails to add a deposit to paused pool', async () => {
    await settings.setContractPaused(pools.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(pools.address)).equal(true);

    await expectRevert(
      pools.addDeposit(recipient1, {
        from: sender1,
        value: ether('1'),
      }),
      'Depositing is currently disabled.'
    );
    await checkCollectorBalance(pools, new BN(0));
    await checkNewPoolCollectedAmount(pools, new BN(0));
  });
});
