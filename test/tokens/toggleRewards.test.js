const {
  expectEvent,
  expectRevert,
  ether,
  BN,
  send,
  constants,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setupOracleAccounts,
  setTotalRewards,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');

contract('StakedEthToken (toggle rewards)', ([_, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles,
    rewardEthToken,
    stakedEthToken,
    distributorReward,
    pool,
    oracleAccounts,
    distributorPrincipal;
  let [account, anyone] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    oracles = await Oracles.at(upgradedContracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    oracleAccounts = await setupOracleAccounts({ oracles, admin, accounts });
    distributorPrincipal = await stakedEthToken.distributorPrincipal();
    distributorReward = await rewardEthToken.balanceOf(constants.ZERO_ADDRESS);
  });

  afterEach(async () => resetFork());

  describe('toggle rewards', () => {
    it('not admin cannot toggle rewards', async () => {
      await expectRevert(
        stakedEthToken.toggleRewards(account, true, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to toggle rewards with the same value', async () => {
      await expectRevert(
        stakedEthToken.toggleRewards(account, false, {
          from: admin,
        }),
        'RewardEthToken: value did not change'
      );
    });

    it('fails to toggle rewards with invalid account', async () => {
      await expectRevert(
        stakedEthToken.toggleRewards(constants.ZERO_ADDRESS, true, {
          from: admin,
        }),
        'StakedEthToken: invalid account'
      );
    });

    it('admin can toggle rewards', async () => {
      let deposit = ether('5');

      // mint sETH2 for disabled account
      await pool.stake({
        from: account,
        value: deposit,
      });

      let receipt = await stakedEthToken.toggleRewards(account, true, {
        from: admin,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsToggled',
        {
          account,
          isDisabled: true,
        }
      );
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );

      receipt = await stakedEthToken.toggleRewards(account, false, {
        from: admin,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsToggled',
        {
          account,
          isDisabled: false,
        }
      );
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
    });

    it('balance is not updated for disabled rewards account', async () => {
      await stakedEthToken.toggleRewards(account, true, {
        from: admin,
      });
      let deposit = ether('5');

      // mint sETH2 for disabled account
      await pool.stake({
        from: account,
        value: deposit,
      });
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // distributor principal updated
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(distributorReward);

      // mint sETH2 for normal account
      await pool.stake({
        from: anyone,
        value: ether('5'),
      });
      expect(await stakedEthToken.balanceOf(anyone)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(anyone)).to.be.bignumber.equal(
        new BN(0)
      );

      // new rewards arrive
      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // arrived reward
      let balance = await rewardEthToken.balanceOf(anyone);
      expect(balance).to.be.bignumber.greaterThan(new BN(0));

      // check disabled account balance
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // check distributor balance
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.greaterThan(distributorReward);

      // check normal account balance
      expect(await stakedEthToken.balanceOf(anyone)).to.be.bignumber.equal(
        deposit
      );

      // check transfer for disabled account
      await expectRevert(
        rewardEthToken.transfer(anyone, balance, {
          from: account,
        }),
        'SafeMath: subtraction overflow'
      );

      // check transfer for normal account
      await rewardEthToken.transfer(account, balance, {
        from: anyone,
      });
    });

    it('toggling rewards does not affect current rewards balance', async () => {
      // mint sETH2 for disabled account
      let deposit = ether('5');
      await pool.stake({
        from: account,
        value: deposit,
      });

      // manual checkpoints update
      await rewardEthToken.updateRewardCheckpoint(account);
      await rewardEthToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardEthToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // manual checkpoints update
      await rewardEthToken.updateRewardCheckpoint(account);
      await rewardEthToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardEthToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check account's balance and reward arrived as usual
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      let periodReward = await rewardEthToken.balanceOf(account);
      expect(periodReward).to.be.bignumber.greaterThan(new BN(0));

      // check distributor reward arrived as usual
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
      let newDistributorReward = await rewardEthToken.balanceOf(
        constants.ZERO_ADDRESS
      );
      expect(newDistributorReward).to.be.bignumber.greaterThan(
        distributorReward
      );

      // disable rewards
      await stakedEthToken.toggleRewards(account, true, {
        from: admin,
      });

      // manual checkpoints update
      await rewardEthToken.updateRewardCheckpoint(account);
      await rewardEthToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardEthToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check account's balance and reward didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance updated, reward didn't change
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(newDistributorReward);

      // next rewards arrive
      totalRewards = totalRewards.add(ether('10'));
      await setTotalRewards({
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // manual checkpoints update
      await rewardEthToken.updateRewardCheckpoint(account);
      await rewardEthToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardEthToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check user's balance and reward didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance didn't change, reward updated
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.greaterThan(newDistributorReward);
      newDistributorReward = await rewardEthToken.balanceOf(
        constants.ZERO_ADDRESS
      );

      // re-enable rewards
      await stakedEthToken.toggleRewards(account, false, {
        from: admin,
      });

      // manual checkpoints update
      await rewardEthToken.updateRewardCheckpoint(account);
      await rewardEthToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardEthToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check user's balance and reward didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance updated, reward didnt' change
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
      expect(
        await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(newDistributorReward);
    });
  });

  describe('claim rewards', () => {
    it('not merkle distributor cannot claim rewards', async () => {
      await expectRevert(
        rewardEthToken.claim(account, ether('1'), {
          from: anyone,
        }),
        'RewardEthToken: access denied'
      );
    });
  });
});
