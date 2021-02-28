const { expect } = require('chai');
const { upgrades } = require('hardhat');
const {
  ether,
  expectRevert,
  expectEvent,
  BN,
  time,
} = require('@openzeppelin/test-helpers');
const {
  preparePoolUpgrade,
  preparePoolUpgradeData,
  upgradePool,
} = require('../../deployments/collectors');
const { initialSettings } = require('../../deployments/settings');
const { deployAllContracts } = require('../../deployments');
const {
  getDepositAmount,
  checkCollectorBalance,
  checkPoolTotalActivatingAmount,
  checkStakedEthToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');

contract('Pool (add deposit)', (accounts) => {
  let pool, stakedEthToken;
  let [admin, sender1, sender2, sender3, oracles] = accounts;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      stakedEthToken: stakedEthTokenContractAddress,
    } = await deployAllContracts({ initialAdmin: admin });

    const proxyAdmin = await upgrades.admin.getInstance();

    // upgrade pool
    pool = await Pool.at(poolContractAddress);
    await pool.addAdmin(proxyAdmin.address, { from: admin });
    await pool.pause({ from: admin });
    const poolImplementation = await preparePoolUpgrade(poolContractAddress);
    const poolUpgradeData = await preparePoolUpgradeData(
      oracles,
      initialSettings.activationDuration,
      initialSettings.beaconActivatingAmount,
      initialSettings.minActivatingDeposit,
      initialSettings.minActivatingShare
    );
    await upgradePool(poolContractAddress, poolImplementation, poolUpgradeData);
    await pool.unpause({ from: admin });

    stakedEthToken = await StakedEthToken.at(stakedEthTokenContractAddress);
  });

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
        max: new BN(initialSettings.minActivatingDeposit),
      });
      let totalSupply = depositAmount1;
      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount({
        max: new BN(initialSettings.minActivatingDeposit),
      });
      await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      totalSupply = totalSupply.add(depositAmount2);
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
        deposit: depositAmount2,
      });

      // check contract balance
      await checkCollectorBalance(pool, totalSupply);
      await checkPoolTotalActivatingAmount(
        pool,
        new BN(initialSettings.beaconActivatingAmount).add(totalSupply)
      );
    });

    it('mints tokens for users with activation duration disabled', async () => {
      // disable activation duration
      await pool.setActivationDuration(new BN('0'), {
        from: oracles,
      });

      // User 1 creates a deposit
      let depositAmount1 = getDepositAmount({
        min: new BN(initialSettings.minActivatingDeposit),
      });
      let totalSupply = depositAmount1;
      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount({
        min: new BN(initialSettings.minActivatingDeposit),
      });
      await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      totalSupply = totalSupply.add(depositAmount2);
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
        deposit: depositAmount2,
      });

      // check contract balance
      await checkCollectorBalance(pool, totalSupply);
      await checkPoolTotalActivatingAmount(
        pool,
        new BN(initialSettings.beaconActivatingAmount).add(totalSupply)
      );
    });

    it('places deposit of user to the activation queue with exceeded max activating share', async () => {
      await pool.setMinActivatingShare(ether('0.1'), { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // User 1 creates a deposit
      let depositAmount1 = ether('10');

      // check first deposit is minted immediately
      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      let totalBeaconActivatingAmount = ether('0.5');
      await pool.setTotalActivatingAmount(totalBeaconActivatingAmount, {
        from: oracles,
      });

      // User 2 creates a deposit
      let depositAmount2 = ether('0.51');

      // check deposit amount placed in activation queue
      let receipt = await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      await expectEvent(receipt, 'ActivationScheduled', {
        sender: sender2,
        value: depositAmount2,
      });
      expect(
        await pool.activations(sender2, receipt.logs[0].args.activationTime)
      ).to.bignumber.equal(depositAmount2);

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      // check contract balance
      await checkCollectorBalance(pool, depositAmount1.add(depositAmount2));
      await checkPoolTotalActivatingAmount(
        pool,
        totalBeaconActivatingAmount.add(depositAmount2)
      );
    });

    it('activates deposit of user immediately with not exceeded max activating share', async () => {
      await pool.setMinActivatingShare(ether('0.1'), { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // User 1 creates a deposit
      let depositAmount1 = ether('10');

      // check first deposit is minted immediately
      await pool.addDeposit({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1,
        account: sender1,
        balance: depositAmount1,
        deposit: depositAmount1,
      });

      let totalBeaconActivatingAmount = ether('0.5');
      await pool.setTotalActivatingAmount(totalBeaconActivatingAmount, {
        from: oracles,
      });

      // User 2 creates a deposit
      let depositAmount2 = ether('0.5');

      // check deposit amount added immediately
      await pool.addDeposit({
        from: sender2,
        value: depositAmount2,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: depositAmount1.add(depositAmount2),
        account: sender2,
        balance: depositAmount2,
        deposit: depositAmount2,
      });

      // check contract balance
      await checkCollectorBalance(pool, depositAmount1.add(depositAmount2));
      await checkPoolTotalActivatingAmount(
        pool,
        totalBeaconActivatingAmount.add(depositAmount2)
      );
    });
  });

  describe('activating', () => {
    let activationTime, depositAmount;

    beforeEach(async () => {
      // first deposit mints automatically
      await pool.addDeposit({
        value: ether('1'),
        from: sender2,
      });

      depositAmount = getDepositAmount({
        min: new BN(initialSettings.minActivatingDeposit),
      });

      let receipt = await pool.addDeposit({
        from: sender1,
        value: depositAmount,
      });
      activationTime = receipt.logs[0].args.activationTime;
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
        amount: depositAmount,
        sender: sender1,
      });

      await checkStakedEthToken({
        stakedEthToken,
        account: sender1,
        balance: depositAmount,
        deposit: depositAmount,
      });

      // check contract balance
      await checkCollectorBalance(pool, depositAmount.add(ether('1')));
      await checkPoolTotalActivatingAmount(
        pool,
        depositAmount
          .add(ether('1'))
          .add(new BN(initialSettings.beaconActivatingAmount))
      );
    });
  });

  describe('activating multiple', () => {
    let activationTime1, activationTime2, depositAmount1, depositAmount2;

    beforeEach(async () => {
      // first deposit mints automatically
      await pool.addDeposit({
        value: ether('1'),
        from: sender2,
      });

      depositAmount1 = getDepositAmount({
        min: new BN(initialSettings.minActivatingDeposit),
      });

      depositAmount2 = getDepositAmount({
        min: new BN(initialSettings.minActivatingDeposit),
      });

      let receipt = await pool.addDeposit({
        from: sender3,
        value: depositAmount1,
      });
      activationTime1 = receipt.logs[0].args.activationTime;
      await time.increase(time.duration.days(1));

      receipt = await pool.addDeposit({
        from: sender3,
        value: depositAmount2,
      });
      activationTime2 = receipt.logs[0].args.activationTime;
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

      let totalBalance = depositAmount1.add(depositAmount2);
      await checkStakedEthToken({
        stakedEthToken,
        account: sender3,
        balance: totalBalance,
        deposit: totalBalance,
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        activationTime: activationTime1,
        amount: depositAmount1,
        sender: sender3,
      });
      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        activationTime: activationTime2,
        amount: depositAmount2,
        sender: sender3,
      });

      // check contract balance
      await checkCollectorBalance(pool, totalBalance.add(ether('1')));
      await checkPoolTotalActivatingAmount(
        pool,
        totalBalance
          .add(ether('1'))
          .add(new BN(initialSettings.beaconActivatingAmount))
      );
    });
  });
});
