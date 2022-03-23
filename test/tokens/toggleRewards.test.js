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
  stakeGNO,
} = require('../utils');
const { contractSettings } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const RewardToken = artifacts.require('RewardToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');
const StakedToken = artifacts.require('StakedToken');

contract('StakedToken (toggle rewards)', ([_, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles,
    rewardToken,
    stakedToken,
    distributorReward,
    pool,
    oracleAccounts,
    distributorPrincipal;
  let [account, anyone] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let contracts = await upgradeContracts();
    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardToken = await RewardToken.at(contracts.rewardToken);
    stakedToken = await StakedToken.at(contracts.stakedToken);
    oracleAccounts = await setupOracleAccounts({ oracles, admin, accounts });
    distributorPrincipal = await stakedToken.distributorPrincipal();
    distributorReward = await rewardToken.balanceOf(constants.ZERO_ADDRESS);
  });

  afterEach(async () => resetFork());

  describe('toggle rewards', () => {
    it('not admin cannot toggle rewards', async () => {
      await expectRevert(
        stakedToken.toggleRewards(account, true, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to toggle rewards with the same value', async () => {
      await expectRevert(
        stakedToken.toggleRewards(account, false, {
          from: admin,
        }),
        'RewardToken: value did not change'
      );
    });

    it('fails to toggle rewards with invalid account', async () => {
      await expectRevert(
        stakedToken.toggleRewards(constants.ZERO_ADDRESS, true, {
          from: admin,
        }),
        'StakedToken: invalid account'
      );
    });

    it('admin can toggle rewards', async () => {
      let deposit = ether('5');

      // mint sGNO for disabled account
      await stakeGNO({ account: account, amount: deposit, pool });

      let receipt = await stakedToken.toggleRewards(account, true, {
        from: admin,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsToggled',
        {
          account,
          isDisabled: true,
        }
      );
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );

      receipt = await stakedToken.toggleRewards(account, false, {
        from: admin,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsToggled',
        {
          account,
          isDisabled: false,
        }
      );
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
    });

    it('balance is not updated for disabled rewards account', async () => {
      await stakedToken.toggleRewards(account, true, {
        from: admin,
      });
      let deposit = ether('5');

      // mint sGNO for disabled account
      await stakeGNO({ account, amount: deposit, pool });

      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // distributor principal updated
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(distributorReward);

      // mint sGNO for normal account
      await stakeGNO({ account: anyone, amount: ether('5'), pool });

      expect(await stakedToken.balanceOf(anyone)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardToken.balanceOf(anyone)).to.be.bignumber.equal(
        new BN(0)
      );

      // new rewards arrive
      let totalRewards = (await rewardToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        rewardToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // arrived reward
      let balance = await rewardToken.balanceOf(anyone);
      expect(balance).to.be.bignumber.greaterThan(new BN(0));

      // check disabled account balance
      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // check distributor balance
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(deposit)
      );
      expect(
        await rewardToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.greaterThan(distributorReward);

      // check normal account balance
      expect(await stakedToken.balanceOf(anyone)).to.be.bignumber.equal(
        deposit
      );

      // check transfer for disabled account
      await expectRevert(
        rewardToken.transfer(anyone, balance, {
          from: account,
        }),
        'SafeMath: subtraction overflow'
      );

      // check transfer for normal account
      await rewardToken.transfer(account, balance, {
        from: anyone,
      });
    });

    it('toggling rewards does not affect current rewards balance', async () => {
      // mint sGNO for disabled account
      let deposit = ether('32');
      let mintedAmount = ether('1');
      await stakeGNO({ account, amount: deposit, pool });

      // manual checkpoints update
      await rewardToken.updateRewardCheckpoint(account);
      await rewardToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      let totalRewards = (await rewardToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        rewardToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // manual checkpoints update
      await rewardToken.updateRewardCheckpoint(account);
      await rewardToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check account's balance and reward arrived as usual
      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        mintedAmount
      );
      let periodReward = await rewardToken.balanceOf(account);
      expect(periodReward).to.be.bignumber.greaterThan(new BN(0));

      // check distributor reward arrived as usual
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
      let newDistributorReward = await rewardToken.balanceOf(
        constants.ZERO_ADDRESS
      );
      expect(newDistributorReward).to.be.bignumber.equal(distributorReward);

      // disable rewards
      await stakedToken.toggleRewards(account, true, {
        from: admin,
      });

      // manual checkpoints update
      await rewardToken.updateRewardCheckpoint(account);
      await rewardToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check account's balance and reward didn't change
      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        mintedAmount
      );
      expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance updated, reward didn't change
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(mintedAmount)
      );
      expect(
        await rewardToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(newDistributorReward);

      // next rewards arrive
      totalRewards = totalRewards.add(ether('10'));
      await setTotalRewards({
        rewardToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // manual checkpoints update
      await rewardToken.updateRewardCheckpoint(account);
      await rewardToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check user's balance and reward didn't change
      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        mintedAmount
      );
      expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance didn't change, reward updated
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(mintedAmount)
      );
      expect(
        await rewardToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.greaterThan(newDistributorReward);
      newDistributorReward = await rewardToken.balanceOf(
        constants.ZERO_ADDRESS
      );

      // re-enable rewards
      await stakedToken.toggleRewards(account, false, {
        from: admin,
      });

      // manual checkpoints update
      await rewardToken.updateRewardCheckpoint(account);
      await rewardToken.updateRewardCheckpoint(constants.ZERO_ADDRESS);
      await rewardToken.updateRewardCheckpoints(
        account,
        constants.ZERO_ADDRESS
      );

      // check user's balance and reward didn't change
      expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(
        mintedAmount
      );
      expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
        periodReward
      );

      // check distributor balance updated, reward didnt' change
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
      expect(
        await rewardToken.balanceOf(constants.ZERO_ADDRESS)
      ).to.be.bignumber.equal(newDistributorReward);
    });
  });

  describe('claim rewards', () => {
    it('not merkle distributor cannot claim rewards', async () => {
      await expectRevert(
        rewardToken.claim(account, ether('1'), {
          from: anyone,
        }),
        'RewardToken: access denied'
      );
    });
  });
});
