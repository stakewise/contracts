const { expect } = require('chai');
const {
  BN,
  ether,
  constants,
  expectEvent,
  expectRevert
} = require('openzeppelin-test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  POOLS_ENTITY_PREFIX,
  getDepositAmount,
  getUserId,
  getEntityId,
  removeNetworkFile,
  checkCollectorBalance
} = require('../utils');

const Deposits = artifacts.require('Deposits');
const Pools = artifacts.require('Pools');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Pools', ([_, admin, sender1, withdrawer1, sender2, withdrawer2]) => {
  let networkConfig;
  let deposits;
  let vrc;
  let pools;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC(admin);
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let { deposits: depositsProxy, pools: poolsProxy } = await deployAllProxies(
      { initialAdmin: admin, networkConfig, vrc: vrc.address }
    );
    pools = await Pools.at(poolsProxy);
    deposits = await Deposits.at(depositsProxy);
  });

  it('fails to add a deposit with zero withdraw address', async () => {
    await expectRevert(
      pools.addDeposit(constants.ZERO_ADDRESS, {
        from: sender1
      }),
      'Withdraw address cannot be zero address.'
    );
    await checkCollectorBalance(pools, new BN(0));
  });

  it('fails to add a deposit without any amount', async () => {
    await expectRevert(
      pools.addDeposit(withdrawer1, {
        from: sender1,
        value: ether('0')
      }),
      'Deposit amount cannot be zero.'
    );
    await checkCollectorBalance(pools, new BN(0));
  });

  it('fails to add a deposit with unit less than minimal', async () => {
    await expectRevert(
      pools.addDeposit(withdrawer1, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(new BN(1))
      }),
      'Invalid deposit amount unit.'
    );
    await checkCollectorBalance(pools, new BN(0));
  });

  it('adds a deposit smaller than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      max: validatorDepositAmount
    });
    const poolId = getEntityId(POOLS_ENTITY_PREFIX, 1);
    const userId = getUserId(poolId, sender1, withdrawer1);

    // Send a deposit
    const { logs } = await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: depositAmount
    });
    expectEvent.inLogs(logs, 'DepositAdded', {
      poolId: poolId,
      amount: depositAmount,
      sender: sender1,
      withdrawer: withdrawer1
    });

    // Check deposit added to Deposits contract
    expect(await deposits.amounts(userId)).to.be.bignumber.equal(depositAmount);

    // Check pools balance
    await checkCollectorBalance(pools, depositAmount);
  });

  it('adds a deposit bigger than validator deposit amount', async () => {
    const depositAmount = getDepositAmount({
      min: validatorDepositAmount,
      max: validatorDepositAmount.mul(new BN(2))
    });

    // Create a deposit
    const { logs } = await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: depositAmount
    });

    // Check added to the pool 1
    let poolId = getEntityId(POOLS_ENTITY_PREFIX, 1);
    let userId = getUserId(poolId, sender1, withdrawer1);
    expectEvent.inLogs(logs, 'DepositAdded', {
      poolId: poolId,
      amount: validatorDepositAmount,
      sender: sender1,
      withdrawer: withdrawer1
    });
    expect(await deposits.amounts(userId)).to.be.bignumber.equal(
      validatorDepositAmount
    );

    // Check added to the pool 2
    poolId = getEntityId(POOLS_ENTITY_PREFIX, 2);
    userId = getUserId(poolId, sender1, withdrawer1);
    expectEvent.inLogs(logs, 'DepositAdded', {
      poolId: poolId,
      amount: depositAmount.sub(validatorDepositAmount),
      sender: sender1,
      withdrawer: withdrawer1
    });
    expect(await deposits.amounts(userId)).to.be.bignumber.equal(
      depositAmount.sub(validatorDepositAmount)
    );

    // Check contract balance
    await checkCollectorBalance(pools, depositAmount);
  });

  it('adds deposits for different users', async () => {
    let poolId = getEntityId(POOLS_ENTITY_PREFIX, 1);

    // User 1 creates a deposit
    let userId1 = getUserId(poolId, sender1, withdrawer1);
    let depositAmount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    const { logs: logs1 } = await pools.addDeposit(withdrawer1, {
      from: sender1,
      value: depositAmount1
    });
    expectEvent.inLogs(logs1, 'DepositAdded', {
      poolId: poolId,
      amount: depositAmount1,
      sender: sender1,
      withdrawer: withdrawer1
    });

    // Check user 1 added to the pool
    expect(await deposits.amounts(userId1)).to.be.bignumber.equal(
      depositAmount1
    );

    // User 2 creates a deposit
    const userId2 = getUserId(poolId, sender2, withdrawer2);
    let depositAmount2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    const { logs: logs2 } = await pools.addDeposit(withdrawer2, {
      from: sender2,
      value: depositAmount2
    });
    expectEvent.inLogs(logs2, 'DepositAdded', {
      poolId: poolId,
      amount: depositAmount2,
      sender: sender2,
      withdrawer: withdrawer2
    });

    // Check user 2 added to the pool
    expect(await deposits.amounts(userId2)).to.be.bignumber.equal(
      depositAmount2
    );

    // Check contract balance
    await checkCollectorBalance(pools, depositAmount1.add(depositAmount2));
  });

  it('increases deposit amount in pool', async () => {
    let userBalance = new BN(0);
    let poolId = getEntityId(POOLS_ENTITY_PREFIX, 1);
    let userId = getUserId(poolId, sender1, withdrawer1);
    for (let i = 0; i < 16; i++) {
      // User creates a deposit
      let depositAmount = getDepositAmount({
        max: validatorDepositAmount.div(new BN(16))
      });
      const { logs } = await pools.addDeposit(withdrawer1, {
        from: sender1,
        value: depositAmount
      });
      expectEvent.inLogs(logs, 'DepositAdded', {
        poolId: poolId,
        amount: depositAmount,
        sender: sender1,
        withdrawer: withdrawer1
      });

      // Check balance updated
      userBalance.iadd(depositAmount);
      expect(await deposits.amounts(userId)).to.be.bignumber.equal(userBalance);

      // Check contract balance updated
      await checkCollectorBalance(pools, userBalance);
    }
  });

  it('splits deposit amount if it goes to different pools', async () => {
    let balance1 = new BN(0);
    let balance2 = new BN(0);
    let poolId1 = getEntityId(POOLS_ENTITY_PREFIX, 1);
    let poolId2 = getEntityId(POOLS_ENTITY_PREFIX, 2);
    let userId1 = getUserId(poolId1, sender1, withdrawer1);
    let userId2 = getUserId(poolId2, sender1, withdrawer1);

    for (let i = 0; i < 16; i++) {
      // Create a deposit
      let depositAmount = getDepositAmount({
        min: validatorDepositAmount.div(new BN(16)).add(new BN(1)),
        max: validatorDepositAmount.div(new BN(8))
      });
      const { logs } = await pools.addDeposit(withdrawer1, {
        from: sender1,
        value: depositAmount
      });

      if (balance1.add(depositAmount).lte(validatorDepositAmount)) {
        // Deposit goes to pool 1
        expectEvent.inLogs(logs, 'DepositAdded', {
          poolId: poolId1,
          amount: depositAmount,
          sender: sender1,
          withdrawer: withdrawer1
        });
        balance1.iadd(depositAmount);
      } else if (balance1.eq(validatorDepositAmount)) {
        // Deposit goes to pool 2
        expectEvent.inLogs(logs, 'DepositAdded', {
          poolId: poolId2,
          amount: depositAmount,
          sender: sender1,
          withdrawer: withdrawer1
        });
        balance2.iadd(depositAmount);
      } else {
        // Deposit was split between pool 1 and 2
        const toPool1 = validatorDepositAmount.sub(balance1);
        expectEvent.inLogs(logs, 'DepositAdded', {
          poolId: poolId1,
          amount: toPool1,
          sender: sender1,
          withdrawer: withdrawer1
        });
        balance1.iadd(toPool1);

        const toPool2 = depositAmount.sub(toPool1);
        expectEvent.inLogs(logs, 'DepositAdded', {
          poolId: poolId2,
          amount: toPool2,
          sender: sender1,
          withdrawer: withdrawer1
        });
        balance2.iadd(toPool2);
      }
      // Check state of pools 1 and 2
      expect(await deposits.amounts(userId1)).to.be.bignumber.equal(balance1);
      expect(await deposits.amounts(userId2)).to.be.bignumber.equal(balance2);

      // Check contract balance
      await checkCollectorBalance(pools, balance1.add(balance2));
    }
  });
});
