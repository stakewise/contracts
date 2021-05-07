const {
  expectEvent,
  expectRevert,
  ether,
  BN,
  send,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  getOracleAccounts,
  setTotalRewards,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');

contract('RewardEthToken (toggle rewards)', ([_, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles,
    rewardEthToken,
    rewardPerToken,
    stakedEthToken,
    pool,
    oracleAccounts;
  let [account, anyone] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    oracleAccounts = await getOracleAccounts({ oracles });
    rewardPerToken = await rewardEthToken.rewardPerToken();
  });

  afterEach(async () => resetFork());

  describe('toggle rewards', () => {
    it('not admin cannot toggle rewards', async () => {
      await expectRevert(
        rewardEthToken.toggleRewards(account, true, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can toggle rewards', async () => {
      let receipt = await rewardEthToken.toggleRewards(account, true, {
        from: admin,
      });
      await expectEvent(receipt, 'RewardsToggled', {
        account,
        rewardPerToken,
        isDisabled: true,
      });
      receipt = await rewardEthToken.toggleRewards(account, false, {
        from: admin,
      });
      await expectEvent(receipt, 'RewardsToggled', {
        account,
        rewardPerToken,
        isDisabled: false,
      });
    });

    it('balance is not updated for disabled rewards account', async () => {
      await rewardEthToken.toggleRewards(account, true, {
        from: admin,
      });
      let deposit = ether('5');

      // mint sETH2 for disabled account
      await pool.addDeposit({
        from: account,
        value: deposit,
      });
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // mint sETH2 for normal account
      await pool.addDeposit({
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
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // check disabled account balance
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        new BN(0)
      );

      // check normal account balance
      expect(await stakedEthToken.balanceOf(anyone)).to.be.bignumber.equal(
        deposit
      );
      let balance = await rewardEthToken.balanceOf(anyone);
      expect(balance).to.be.bignumber.greaterThan(new BN(0));

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
      await pool.addDeposit({
        from: account,
        value: deposit,
      });
      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // check balance
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      let balance = await rewardEthToken.balanceOf(account);
      expect(balance).to.be.bignumber.greaterThan(new BN(0));

      // disable rewards
      await rewardEthToken.toggleRewards(account, true, {
        from: admin,
      });

      // check balance didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        balance
      );

      // next rewards arrive
      totalRewards = totalRewards.add(ether('10'));
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // check balance didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        balance
      );

      // re-enable rewards
      await rewardEthToken.toggleRewards(account, false, {
        from: admin,
      });

      // check balance didn't change
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
        balance
      );

      // next rewards arrive
      totalRewards = totalRewards.add(ether('10'));
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // check balance changed
      expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
        deposit
      );
      expect(
        await rewardEthToken.balanceOf(account)
      ).to.be.bignumber.greaterThan(balance);
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
