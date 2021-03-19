const { expect } = require('chai');
const {
  ether,
  balance,
  send,
  expectRevert,
  expectEvent,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  getDepositAmount,
  getOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { checkCollectorBalance, checkStakedEthToken } = require('../utils');
const { validatorParams } = require('./validatorParams');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Validators = artifacts.require('Validators');

const withdrawalCredentials =
  '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';

contract('Pool (add deposit)', ([sender1, sender2, sender3, operator]) => {
  const admin = contractSettings.admin;
  let pool,
    stakedEthToken,
    totalSupply,
    poolBalance,
    oracleAccounts,
    rewardEthToken,
    oracles,
    activatedValidators,
    pendingValidators;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    // update contract settings before upgrade
    contractSettings.activatedValidators = '10';
    contractSettings.pendingValidators = '0';

    // reset contract settings
    activatedValidators = new BN(contractSettings.activatedValidators);
    pendingValidators = new BN(contractSettings.pendingValidators);

    await impersonateAccount(admin);
    await send.ether(sender3, admin, ether('5'));
    await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });

    totalSupply = await stakedEthToken.totalSupply();
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
    });

    it('places deposit of user to the activation queue with exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1000', { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit more than 10 %
      let depositAmount = ether('32').mul(new BN(2));
      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators.add(new BN(2));

      // check deposit amount placed in activation queue
      let receipt = await pool.addDeposit({
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
      await checkCollectorBalance(pool, poolBalance);
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
      let receipt = await pool.addDeposit({
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
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(new BN(0));

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
    });
  });

  describe('activating', () => {
    let validatorIndex, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.addDeposit({
        from: sender1,
        value: depositAmount,
      });
      validatorIndex = activatedValidators.add(new BN(1));

      let validators = await Validators.at(contracts.validators);
      await validators.addOperator(operator, { from: admin });
      await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });
      await pool.registerValidator(validatorParams[0], {
        from: operator,
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
        deposit: depositAmount,
      });

      // check contract balance
      await checkCollectorBalance(pool, poolBalance);
    });
  });

  describe('activating multiple', () => {
    let validatorIndex1, validatorIndex2, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.addDeposit({
        from: sender3,
        value: depositAmount,
      });
      validatorIndex1 = activatedValidators.add(new BN(1));

      await pool.addDeposit({
        from: sender3,
        value: depositAmount,
      });
      validatorIndex2 = activatedValidators.add(new BN(2));

      let validators = await Validators.at(contracts.validators);
      await validators.addOperator(operator, { from: admin });
      await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });
      await pool.registerValidator(validatorParams[0], {
        from: operator,
      });
      await pool.registerValidator(validatorParams[1], {
        from: operator,
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
        deposit: depositAmount.mul(new BN(2)),
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
      await checkCollectorBalance(pool, poolBalance);
    });
  });
});
