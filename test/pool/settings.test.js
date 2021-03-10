const { expect } = require('chai');
const {
  send,
  ether,
  expectRevert,
  expectEvent,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setActivationDuration,
  setTotalStakingAmount,
  getOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const RewardEthToken = artifacts.require('RewardEthToken');

contract('Pool (settings)', ([anyone]) => {
  const admin = contractSettings.admin;
  let pool, oracles, oracleAccounts, rewardEthToken;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));
    await upgradeContracts();
    pool = await Pool.at(contracts.pool);

    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
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

  describe('min activating share', () => {
    it('not admin fails to set min activating share', async () => {
      await expectRevert(
        pool.setMinActivatingShare('1000', {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set min activating share', async () => {
      let minActivatingShare = '1000';
      let receipt = await pool.setMinActivatingShare(minActivatingShare, {
        from: admin,
      });
      await expectEvent(receipt, 'MinActivatingShareUpdated', {
        minActivatingShare,
        sender: admin,
      });
      expect(await pool.minActivatingShare()).to.bignumber.equal(
        minActivatingShare
      );
    });

    it('fails to set invalid min activating share', async () => {
      await expectRevert(
        pool.setMinActivatingShare(10000, {
          from: admin,
        }),
        'Pool: invalid share'
      );
    });
  });

  describe('activation duration', () => {
    it('not oracles contract or admin fails to set activation duration', async () => {
      await expectRevert(
        pool.setActivationDuration(ether('10'), {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('admin override activation duration', async () => {
      let activationDuration = new BN('2592000');
      let receipt = await pool.setActivationDuration(activationDuration, {
        from: admin,
      });
      expectEvent(receipt, 'ActivationDurationUpdated', {
        activationDuration,
      });
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
    });

    it('oracles contract can set activation duration', async () => {
      let activationDuration = new BN('2592000');
      let receipt = await setActivationDuration({
        pool,
        rewardEthToken,
        activationDuration,
        oracleAccounts,
        oracles,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        Pool,
        'ActivationDurationUpdated',
        {
          activationDuration,
          sender: contracts.oracles,
        }
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
    });
  });

  describe('total staking amount', () => {
    it('not oracles contract fails to set total staking amount', async () => {
      await expectRevert(
        pool.setTotalStakingAmount(ether('100'), {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('oracles contract can set total staking amount', async () => {
      let totalStakingAmount = await pool.totalCollectedAmount();
      let receipt = await setTotalStakingAmount({
        pool,
        rewardEthToken,
        totalStakingAmount,
        oracleAccounts,
        oracles,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        Pool,
        'TotalStakingAmountUpdated',
        {
          totalStakingAmount,
          sender: contracts.oracles,
        }
      );
      expect(await pool.totalStakingAmount()).to.bignumber.equal(
        totalStakingAmount
      );
    });
  });

  describe('withdrawal credentials', () => {
    const withdrawalCredentials =
      '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';

    it('not admin fails to update withdrawal credentials', async () => {
      await expectRevert(
        pool.setWithdrawalCredentials(withdrawalCredentials, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update withdrawal credentials', async () => {
      let receipt = await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });

      await expectEvent(receipt, 'WithdrawalCredentialsUpdated', {
        withdrawalCredentials,
      });
      expect(await pool.withdrawalCredentials()).to.equal(
        withdrawalCredentials
      );
    });
  });
});
