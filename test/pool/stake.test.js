const { expect } = require('chai');
const {
  ether,
  balance,
  send,
  expectRevert,
  expectEvent,
  constants,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  getDepositAmount,
  registerValidator,
  setupOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { checkStakedEthToken } = require('../utils');
const { initializeData } = require('./initializeMerkleRoot');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');
const PoolValidators = artifacts.require('PoolValidators');
const RevenueSharing = artifacts.require('RevenueSharing');
const Oracles = artifacts.require('Oracles');

contract('Pool (stake)', (accounts) => {
  const admin = contractSettings.admin;
  let [sender1, sender2, sender3, operator, ...otherAccounts] = accounts;
  let pool,
    stakedEthToken,
    validators,
    partnersRevenueSharing,
    oracles,
    oracleAccounts,
    totalSupply,
    poolBalance,
    activatedValidators,
    pendingValidators;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender3, admin, ether('5'));
    let upgradedContracts = await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    validators = await PoolValidators.at(upgradedContracts.poolValidators);
    partnersRevenueSharing = await RevenueSharing.at(
      upgradedContracts.partnersRevenueSharing
    );
    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });

    totalSupply = await stakedEthToken.totalSupply();
    poolBalance = await balance.current(pool.address);
    activatedValidators = await pool.activatedValidators();
    pendingValidators = await pool.pendingValidators();
  });

  afterEach(async () => resetFork());

  describe('stake', () => {
    it('fails to stake with zero amount', async () => {
      await expectRevert(
        pool.stake(sender1, { from: sender1, value: ether('0') }),
        'Pool: invalid deposit amount'
      );
    });

    it('fails to stake with zero address', async () => {
      await expectRevert(
        pool.stake(constants.ZERO_ADDRESS, {
          from: sender1,
          value: ether('0'),
        }),
        'Pool: invalid recipient'
      );
    });

    it('fails to stake in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.stake({
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
      poolBalance = poolBalance.add(depositAmount1);

      await pool.stake({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount({
        max: new BN(contractSettings.minActivatingDeposit),
      });
      totalSupply = totalSupply.add(depositAmount2);
      poolBalance = poolBalance.add(depositAmount2);

      await pool.stake({
        from: sender2,
        value: depositAmount2,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
      });

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    it('places deposit of user to the activation queue with exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit more than 0.01 %
      let depositAmount = ether('32').mul(new BN(2));
      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(new BN(2));

      // check deposit amount placed in activation queue
      let receipt = await pool.stake({
        from: sender1,
        value: depositAmount,
      });
      await expectEvent(receipt, 'ActivationScheduled', {
        sender: sender1,
        validatorIndex,
        value: depositAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(depositAmount);

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
      expect(await stakedEthToken.totalSupply()).to.bignumber.equal(
        totalSupply
      );
    });

    it('activates deposit of user immediately with not exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1000', { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit less than 10 %
      let depositAmount = ether('32');
      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(new BN(1));
      totalSupply = totalSupply.add(depositAmount);

      // check deposit amount added immediately
      await pool.stake({
        from: sender1,
        value: depositAmount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(new BN(0));

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    it('can stake to different recipient address', async () => {
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await pool.stakeOnBehalf(sender2, {
        from: sender1,
        value: amount,
      });
      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender2,
        value: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });
    });

    it('can stake without recipient address', async () => {
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await pool.stake({
        from: sender1,
        value: amount,
      });
      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: amount,
      });
    });

    describe('staking with partner', () => {
      const partner = otherAccounts[0];
      const revenueShare = new BN(1000);

      beforeEach(async () => {
        await partnersRevenueSharing.addAccount(partner, revenueShare, {
          from: admin,
        });
      });

      it('fails to stake with invalid partner', async () => {
        await expectRevert(
          pool.stakeWithPartner(sender1, {
            from: sender1,
            value: ether('1'),
          }),
          'RevenueSharing: account is not added'
        );
      });

      it('can stake with partner', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let prevTotalPoints = await partnersRevenueSharing.totalPoints();
        let receipt = await pool.stakeWithPartner(partner, {
          from: sender1,
          value: amount,
        });
        await expectEvent.inTransaction(
          receipt.tx,
          StakedEthToken,
          'Transfer',
          {
            from: constants.ZERO_ADDRESS,
            to: sender1,
            value: amount,
          }
        );
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender1,
          balance: amount,
        });

        await expectEvent.inTransaction(
          receipt.tx,
          RevenueSharing,
          'AmountIncreased',
          {
            beneficiary: partner,
            amount: amount,
            reward: new BN(0),
          }
        );

        let points = revenueShare.mul(amount);
        expect(
          (await partnersRevenueSharing.checkpoints(partner)).amount
        ).to.bignumber.equal(amount);
        expect(
          await partnersRevenueSharing.pointsOf(partner)
        ).to.bignumber.equal(points);
        expect(await partnersRevenueSharing.totalPoints()).to.bignumber.equal(
          prevTotalPoints.add(points)
        );
      });

      it('can stake with partner and different recipient', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let receipt = await pool.stakeWithPartnerOnBehalf(partner, sender2, {
          from: sender1,
          value: amount,
        });
        await expectEvent.inTransaction(
          receipt.tx,
          StakedEthToken,
          'Transfer',
          {
            from: constants.ZERO_ADDRESS,
            to: sender2,
            value: amount,
          }
        );
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender2,
          balance: amount,
        });
      });
    });
  });

  describe('activating', () => {
    let validatorIndex, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.stake(sender1, {
        from: sender1,
        value: depositAmount,
      });
      validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(new BN(1));

      await registerValidator({
        admin,
        validators,
        oracles,
        oracleAccounts,
        operator,
      });
    });

    it('fails to activate with invalid validator index', async () => {
      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pool: validator is not active yet'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      await expectRevert(
        pool.activate(sender2, validatorIndex, {
          from: sender1,
        }),
        'Pool: invalid validator index'
      );
    });

    it('fails to activate deposit amount twice', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      await pool.activate(sender1, validatorIndex, {
        from: sender1,
      });

      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pool: invalid validator index'
      );
    });

    it('activates deposit amount', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      expect(await pool.canActivate(validatorIndex)).to.equal(true);
      let receipt = await pool.activate(sender1, validatorIndex, {
        from: sender1,
      });
      await expectEvent(receipt, 'Activated', {
        account: sender1,
        validatorIndex,
        value: depositAmount,
        sender: sender1,
      });
      totalSupply = totalSupply.add(depositAmount);

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });
  });

  describe('activating multiple', () => {
    let validatorIndex1, validatorIndex2, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.stake({
        from: sender3,
        value: depositAmount,
      });
      validatorIndex1 = activatedValidators
        .add(pendingValidators)
        .add(new BN(1));

      await pool.stake({
        from: sender3,
        value: depositAmount,
      });
      validatorIndex2 = activatedValidators
        .add(pendingValidators)
        .add(new BN(2));

      await registerValidator({
        admin,
        validators,
        oracles,
        oracleAccounts,
        operator,
        depositDataIndex: 0,
      });
      await registerValidator({
        admin,
        validators,
        oracles,
        oracleAccounts,
        operator,
        depositDataIndex: 1,
      });
    });

    it('fails to activate with invalid validator indexes', async () => {
      await expectRevert(
        pool.activateMultiple(
          sender3,
          [validatorIndex1.add(new BN(2)), validatorIndex2.add(new BN(3))],
          {
            from: sender3,
          }
        ),
        'Pool: validator is not active yet'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      await expectRevert(
        pool.activateMultiple(sender2, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pool: invalid validator index'
      );
    });

    it('fails to activate multiple deposit amounts twice', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      await pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
        from: sender3,
      });

      await expectRevert(
        pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pool: invalid validator index'
      );
    });

    it('activates multiple deposit amounts', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      expect(await pool.canActivate(validatorIndex1)).to.equal(true);
      expect(await pool.canActivate(validatorIndex2)).to.equal(true);
      let receipt = await pool.activateMultiple(
        sender3,
        [validatorIndex1, validatorIndex2],
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
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        validatorIndex: validatorIndex1,
        value: depositAmount,
        sender: sender3,
      });
      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        validatorIndex: validatorIndex2,
        value: depositAmount,
        sender: sender3,
      });

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });
  });

  it('only PoolValidators contract can initialize new validators', async () => {
    const { publicKey, signature, withdrawalCredentials, depositDataRoot } =
      initializeData[0];
    await expectRevert(
      pool.initializeValidator(
        {
          operator,
          withdrawalCredentials,
          depositDataRoot,
          publicKey,
          signature,
        },
        {
          from: sender1,
        }
      ),
      'Pool: access denied'
    );
  });

  it('only PoolValidators contract can finalize new validators', async () => {
    const { publicKey, signature, withdrawalCredentials, depositDataRoot } =
      initializeData[0];
    await expectRevert(
      pool.finalizeValidator(
        {
          operator,
          withdrawalCredentials,
          depositDataRoot,
          publicKey,
          signature,
        },
        {
          from: sender1,
        }
      ),
      'Pool: access denied'
    );
  });

  it('only PoolValidators contract can refund', async () => {
    await expectRevert(
      pool.refund({
        from: sender1,
      }),
      'Pool: access denied'
    );
  });
});
