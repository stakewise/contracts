const { expect } = require('chai');
const {
  ether,
  balance,
  expectRevert,
  expectEvent,
  BN,
  time,
} = require('@openzeppelin/test-helpers');
const {
  setActivationDuration,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  getOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  getDepositAmount,
  checkCollectorBalance,
  checkPoolTotalActivatingAmount,
  checkStakedEthToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');

contract('Pool (add deposit)', ([sender1, sender2, sender3]) => {
  const admin = contractSettings.admin;
  let pool,
    stakedEthToken,
    totalSupply,
    totalActivating,
    poolBalance,
    oracleAccounts,
    rewardEthToken,
    oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });

    totalSupply = await stakedEthToken.totalSupply();
    totalActivating = await pool.totalActivatingAmount();
    poolBalance = await balance.current(pool.address);
  });

  afterEach(async () => resetFork());

  describe('adding deposit', () => {
    it('fails to add a deposit with zero amount', async () => {
      await expectRevert(
        pool.addDeposit({ from: sender1, value: ether('0') }),
        'Pool: invalid deposit amount'
      );
    });

    it('fails to add a deposit to paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.addDeposit({
          from: sender1,
          value: ether('1'),
        }),
        'Pausable: paused'
      );
    });

    it('mints tokens for users with deposit less than min activating', async () => {
      // User 1 creates a deposit
      let depositAmount1 = getDepositAmount({
        max: new BN(contractSettings.minActivatingDeposit),
      });
      totalSupply = totalSupply.add(depositAmount1);
      totalActivating = totalActivating.add(depositAmount1);
      poolBalance = poolBalance.add(depositAmount1);

      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount({
        max: new BN(contractSettings.minActivatingDeposit),
      });
      totalSupply = totalSupply.add(depositAmount2);
      totalActivating = totalActivating.add(depositAmount2);
      poolBalance = poolBalance.add(depositAmount2);

      await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
        deposit: depositAmount2,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });

    it('mints tokens for users with activation duration disabled', async () => {
      // disable activation duration
      await setActivationDuration({
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        activationDuration: new BN(0),
      });

      // User 1 creates a deposit
      let depositAmount1 = getDepositAmount();
      totalSupply = totalSupply.add(depositAmount1);
      totalActivating = totalActivating.add(depositAmount1);
      poolBalance = poolBalance.add(depositAmount1);

      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount();
      totalSupply = totalSupply.add(depositAmount2);
      totalActivating = totalActivating.add(depositAmount2);
      poolBalance = poolBalance.add(depositAmount2);

      await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
        deposit: depositAmount2,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });

    it('places deposit of user to the activation queue with exceeded max activating share', async () => {
      await pool.setMinActivatingShare('1000', { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit more than 10 %
      let depositAmount = totalSupply.div(new BN(10));
      totalActivating = totalActivating.add(depositAmount);
      poolBalance = poolBalance.add(depositAmount);

      // check deposit amount placed in activation queue
      let receipt = await pool.addDeposit({
        from: sender1,
        value: depositAmount,
      });
      await expectEvent(receipt, 'ActivationScheduled', {
        sender: sender1,
        value: depositAmount,
      });
      expect(
        await pool.activations(sender1, receipt.logs[0].args.activationTime)
      ).to.bignumber.equal(depositAmount);

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      expect(await stakedEthToken.totalSupply()).to.bignumber.equal(
        totalSupply
      );
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });

    it('activates deposit of user immediately with not exceeded max activating share', async () => {
      await pool.setMinActivatingShare('1000', { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit less than 10 %
      let depositAmount = ether('1');
      totalActivating = totalActivating.add(depositAmount);
      totalSupply = totalSupply.add(depositAmount);
      poolBalance = poolBalance.add(depositAmount);

      // check deposit amount added immediately
      await pool.addDeposit({
        from: sender1,
        value: depositAmount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
        deposit: depositAmount,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });
  });

  describe('activating', () => {
    let activationTime, depositAmount;

    beforeEach(async () => {
      depositAmount = totalSupply.div(new BN(10));
      let receipt = await pool.addDeposit({
        from: sender1,
        value: depositAmount,
      });
      activationTime = receipt.logs[0].args.activationTime;

      totalActivating = totalActivating.add(depositAmount);
      poolBalance = poolBalance.add(depositAmount);
    });

    it('fails to activate with invalid activation time', async () => {
      await expectRevert(
        pool.activate(sender1, activationTime, { from: sender1 }),
        'Pool: activation time is in future'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activate(sender1, activationTime, {
          from: sender1,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await time.increaseTo(activationTime);
      await expectRevert(
        pool.activate(sender2, activationTime, {
          from: sender1,
        }),
        'Pool: no activating deposit'
      );
    });

    it('fails to activate deposit amount twice', async () => {
      await time.increaseTo(activationTime);
      await pool.activate(sender1, activationTime, {
        from: sender1,
      });

      await expectRevert(
        pool.activate(sender1, activationTime, {
          from: sender1,
        }),
        'Pool: no activating deposit'
      );
    });

    it('activates deposit amount', async () => {
      await time.increaseTo(activationTime);
      let receipt = await pool.activate(sender1, activationTime, {
        from: sender1,
      });
      await expectEvent(receipt, 'Activated', {
        account: sender1,
        activationTime,
        value: depositAmount,
        sender: sender1,
      });
      totalSupply = totalSupply.add(depositAmount);

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
        deposit: depositAmount,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });
  });

  describe('activating multiple', () => {
    let activationTime1, activationTime2, depositAmount;

    beforeEach(async () => {
      depositAmount = totalSupply.div(new BN(10));

      let receipt = await pool.addDeposit({
        from: sender3,
        value: depositAmount,
      });
      activationTime1 = receipt.logs[0].args.activationTime;
      await time.increase(time.duration.days(1));

      receipt = await pool.addDeposit({
        from: sender3,
        value: depositAmount,
      });
      activationTime2 = receipt.logs[0].args.activationTime;

      totalActivating = totalActivating.add(depositAmount.mul(new BN(2)));
      poolBalance = poolBalance.add(depositAmount.mul(new BN(2)));
    });

    it('fails to activate with invalid activation time', async () => {
      await expectRevert(
        pool.activateMultiple(sender3, [activationTime1, activationTime2], {
          from: sender3,
        }),
        'Pool: activation time is in future'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activateMultiple(sender3, [activationTime1, activationTime2], {
          from: sender3,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await time.increaseTo(activationTime2);
      await expectRevert(
        pool.activateMultiple(sender2, [activationTime1, activationTime2], {
          from: sender3,
        }),
        'Pool: no activating deposits'
      );
    });

    it('fails activate multiple deposit amounts twice', async () => {
      await time.increaseTo(activationTime2);
      await pool.activateMultiple(sender3, [activationTime1, activationTime2], {
        from: sender3,
      });

      await expectRevert(
        pool.activateMultiple(sender3, [activationTime1, activationTime2], {
          from: sender3,
        }),
        'Pool: no activating deposit'
      );
    });

    it('activates multiple deposit amounts', async () => {
      await time.increaseTo(activationTime2);
      let receipt = await pool.activateMultiple(
        sender3,
        [activationTime1, activationTime2],
        {
          from: sender3,
        }
      );
      totalSupply = totalSupply.add(depositAmount.mul(new BN(2)));

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender3,
        balance: depositAmount.mul(new BN(2)),
        deposit: depositAmount.mul(new BN(2)),
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        activationTime: activationTime1,
        value: depositAmount,
        sender: sender3,
      });
      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        activationTime: activationTime2,
        value: depositAmount,
        sender: sender3,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
      await checkPoolTotalActivatingAmount(pool, totalActivating);
    });
  });
});
