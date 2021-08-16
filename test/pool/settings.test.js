const { expect } = require('chai');
const {
  send,
  ether,
  expectRevert,
  expectEvent,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setActivatedValidators,
  setupOracleAccounts,
  registerValidator,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const PoolValidators = artifacts.require('PoolValidators');
const RewardEthToken = artifacts.require('RewardEthToken');

contract('Pool (settings)', ([operator, anyone, ...otherAccounts]) => {
  const admin = contractSettings.admin;
  let pool, oracles, oracleAccounts, rewardEthToken, validators;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    validators = await PoolValidators.at(upgradedContracts.poolValidators);
    oracles = await Oracles.at(upgradedContracts.oracles);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
  });

  afterEach(async () => resetFork());

  describe('min activating deposit', () => {
    it('not admin fails to set min activating deposit', async () => {
      await expectRevert(
        pool.setMinActivatingDeposit(ether('10'), {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set min activating deposit', async () => {
      let minActivatingDeposit = ether('10');
      let receipt = await pool.setMinActivatingDeposit(minActivatingDeposit, {
        from: admin,
      });
      await expectEvent(receipt, 'MinActivatingDepositUpdated', {
        minActivatingDeposit,
        sender: admin,
      });
      expect(await pool.minActivatingDeposit()).to.bignumber.equal(
        minActivatingDeposit
      );
    });
  });

  describe('pending validators limit', () => {
    it('not admin fails to set pending validators limit', async () => {
      await expectRevert(
        pool.setPendingValidatorsLimit('1000', {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set pending validators limit', async () => {
      let pendingValidatorsLimit = '1000';
      let receipt = await pool.setPendingValidatorsLimit(
        pendingValidatorsLimit,
        {
          from: admin,
        }
      );
      await expectEvent(receipt, 'PendingValidatorsLimitUpdated', {
        pendingValidatorsLimit,
        sender: admin,
      });
      expect(await pool.pendingValidatorsLimit()).to.bignumber.equal(
        pendingValidatorsLimit
      );
    });

    it('fails to set invalid pending validators limit', async () => {
      await expectRevert(
        pool.setPendingValidatorsLimit(10000, {
          from: admin,
        }),
        'Pool: invalid limit'
      );
    });
  });

  describe('activated validators', () => {
    it('not oracles contract or admin fails to set activated validators', async () => {
      await expectRevert(
        pool.setActivatedValidators('10', {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('admin can override activated validators', async () => {
      let activatedValidators = await pool.activatedValidators();
      activatedValidators = activatedValidators.add(
        await pool.pendingValidators()
      );

      let receipt = await pool.setActivatedValidators(activatedValidators, {
        from: admin,
      });
      expectEvent(receipt, 'ActivatedValidatorsUpdated', {
        activatedValidators,
      });
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
    });

    it('oracles contract can set activated validators', async () => {
      await pool.stake(anyone, {
        from: anyone,
        value: ether('32'),
      });
      await registerValidator({
        admin,
        validators,
        operator,
        oracles,
        oracleAccounts,
      });

      let activatedValidators = await pool.activatedValidators();
      activatedValidators = activatedValidators.add(
        await pool.pendingValidators()
      );

      let receipt = await setActivatedValidators({
        admin,
        pool,
        rewardEthToken,
        activatedValidators,
        oracleAccounts,
        oracles,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        Pool,
        'ActivatedValidatorsUpdated',
        {
          activatedValidators,
          sender: oracles.address,
        }
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
    });
  });
});
