const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../deployments');
const { contractSettings } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setTotalRewards,
  setupOracleAccounts,
} = require('./utils');

const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const RewardEthToken = artifacts.require('RewardEthToken');
const RevenueSharing = artifacts.require('RevenueSharing');

contract('RevenueSharing', ([beneficiary, anyone, ...otherAccounts]) => {
  const admin = contractSettings.admin;
  const revenueShare = new BN(1000);
  let revenueSharing, oracleAccounts, pool, rewardEthToken, oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));
    const contracts = await upgradeContracts();
    revenueSharing = await RevenueSharing.at(contracts.operatorsRevenueSharing);
    pool = await Pool.at(contracts.pool);
    oracles = await Oracles.at(contracts.oracles);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
  });

  afterEach(async () => resetFork());

  describe('addAccount', () => {
    it('fails to add account without admin role', async () => {
      await expectRevert(
        revenueSharing.addAccount(beneficiary, revenueShare, {
          from: beneficiary,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to add account when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.addAccount(beneficiary, revenueShare, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('fails to add account with invalid revenue share', async () => {
      await expectRevert(
        revenueSharing.addAccount(beneficiary, '0', {
          from: admin,
        }),
        'RevenueSharing: invalid revenue share'
      );

      await expectRevert(
        revenueSharing.addAccount(beneficiary, '10001', {
          from: admin,
        }),
        'RevenueSharing: invalid revenue share'
      );
    });

    it('fails to add account with beneficiary', async () => {
      await expectRevert(
        revenueSharing.addAccount(constants.ZERO_ADDRESS, revenueShare, {
          from: admin,
        }),
        'RevenueSharing: invalid beneficiary'
      );
    });

    it('fails to add account twice', async () => {
      await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });

      await expectRevert(
        revenueSharing.addAccount(beneficiary, revenueShare, {
          from: admin,
        }),
        'RevenueSharing: account already added'
      );
    });

    it('admin can add new account', async () => {
      let receipt = await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });

      await expectEvent(receipt, 'AccountAdded', {
        beneficiary,
        revenueShare,
      });

      expect(await revenueSharing.isAdded(beneficiary)).to.equal(true);
    });
  });

  describe('removeAccount', () => {
    beforeEach(async () => {
      await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });
    });

    it('fails to remove account without admin role', async () => {
      await expectRevert(
        revenueSharing.removeAccount(beneficiary, {
          from: beneficiary,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to remove account when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.removeAccount(beneficiary, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('fails to remove not existing account', async () => {
      await expectRevert(
        revenueSharing.removeAccount(anyone, {
          from: admin,
        }),
        'RevenueSharing: account is not added'
      );
    });

    it('admin can remove account', async () => {
      let receipt = await revenueSharing.removeAccount(beneficiary, {
        from: admin,
      });

      await expectEvent(receipt, 'AccountRemoved', {
        beneficiary,
        reward: new BN(0),
      });

      expect(await revenueSharing.isAdded(beneficiary)).to.equal(false);
    });
  });

  describe('updateRevenueShare', () => {
    let newRevenueShare = revenueShare.add(new BN(1000));

    beforeEach(async () => {
      await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });
    });

    it('fails to update revenue share without admin role', async () => {
      await expectRevert(
        revenueSharing.updateRevenueShare(beneficiary, newRevenueShare, {
          from: beneficiary,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to update revenue share when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.updateRevenueShare(beneficiary, newRevenueShare, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('fails to update with invalid revenue share', async () => {
      await expectRevert(
        revenueSharing.updateRevenueShare(beneficiary, '0', {
          from: admin,
        }),
        'RevenueSharing: invalid revenue share'
      );

      await expectRevert(
        revenueSharing.updateRevenueShare(beneficiary, '10001', {
          from: admin,
        }),
        'RevenueSharing: invalid revenue share'
      );

      await expectRevert(
        revenueSharing.updateRevenueShare(beneficiary, revenueShare, {
          from: admin,
        }),
        'RevenueSharing: invalid revenue share'
      );
    });

    it('fails to update revenue share for not existing account', async () => {
      await expectRevert(
        revenueSharing.updateRevenueShare(anyone, newRevenueShare, {
          from: admin,
        }),
        'RevenueSharing: account is not added'
      );
    });

    it('admin can update revenue share', async () => {
      await revenueSharing.increaseAmount(beneficiary, ether('1000'), {
        from: admin,
      });
      let prevPoints = await revenueSharing.pointsOf(beneficiary);
      let prevTotalPoints = await revenueSharing.totalPoints();
      let receipt = await revenueSharing.updateRevenueShare(
        beneficiary,
        newRevenueShare,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'RevenueShareUpdated', {
        beneficiary,
        revenueShare: newRevenueShare,
        reward: new BN(0),
      });

      expect(
        (await revenueSharing.checkpoints(beneficiary)).revenueShare
      ).to.bignumber.equal(newRevenueShare);
      expect(
        await revenueSharing.pointsOf(beneficiary)
      ).to.bignumber.greaterThan(prevPoints);
      expect(await revenueSharing.totalPoints()).to.bignumber.greaterThan(
        prevTotalPoints
      );
    });
  });

  describe('increaseAmount', () => {
    let newAmount = ether('1000');

    beforeEach(async () => {
      await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });
    });

    it('fails to increase amount by not admin or pool', async () => {
      await expectRevert(
        revenueSharing.increaseAmount(beneficiary, newAmount, {
          from: beneficiary,
        }),
        'RevenueSharing: access denied'
      );
    });

    it('fails to increase amount when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.increaseAmount(beneficiary, newAmount, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('fails to increase with zero amount', async () => {
      await expectRevert(
        revenueSharing.increaseAmount(beneficiary, '0', {
          from: admin,
        }),
        'RevenueSharing: invalid amount'
      );
    });

    it('fails to increase amount for not existing account', async () => {
      await expectRevert(
        revenueSharing.increaseAmount(anyone, newAmount, {
          from: admin,
        }),
        'RevenueSharing: account is not added'
      );
    });

    it('admin or pool can increase amount', async () => {
      let prevPoints = await revenueSharing.pointsOf(beneficiary);
      let prevTotalPoints = await revenueSharing.totalPoints();
      let receipt = await revenueSharing.increaseAmount(
        beneficiary,
        newAmount,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'AmountIncreased', {
        beneficiary,
        amount: newAmount,
        reward: new BN(0),
      });

      expect(
        (await revenueSharing.checkpoints(beneficiary)).amount
      ).to.bignumber.equal(newAmount);
      expect(
        await revenueSharing.pointsOf(beneficiary)
      ).to.bignumber.greaterThan(prevPoints);
      expect(await revenueSharing.totalPoints()).to.bignumber.greaterThan(
        prevTotalPoints
      );
    });
  });

  describe('collectRewards', () => {
    let contributedAmount = ether('32');
    let revenueCut;

    beforeEach(async () => {
      // add account and increase contributed amount
      await revenueSharing.addAccount(beneficiary, revenueShare, {
        from: admin,
      });
      await revenueSharing.increaseAmount(beneficiary, contributedAmount, {
        from: admin,
      });

      // increase reward
      let periodReward = ether('10');
      let totalRewards = (await rewardEthToken.totalRewards()).add(
        periodReward
      );
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });
      revenueCut = await rewardEthToken.balanceOf(revenueSharing.address);
    });

    it('fails to collect reward when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.collectReward(beneficiary, {
          from: beneficiary,
        }),
        'Pausable: paused'
      );
    });

    it('fails to collect multiple when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.collectRewards([beneficiary, anyone], {
          from: beneficiary,
        }),
        'Pausable: paused'
      );
    });

    it('fails to collect reward for not existing account', async () => {
      await expectRevert(
        revenueSharing.collectReward(anyone, {
          from: beneficiary,
        }),
        'RevenueSharing: account is not added'
      );
    });

    it('does not fail with zero reward', async () => {
      // withdraw accumulated reward
      await revenueSharing.collectReward(beneficiary, {
        from: beneficiary,
      });

      let receipt = await revenueSharing.collectReward(beneficiary, {
        from: beneficiary,
      });
      const prevReward = await rewardEthToken.balanceOf(beneficiary);

      await expectEvent(receipt, 'RewardCollected', {
        sender: beneficiary,
        beneficiary,
        reward: new BN(0),
      });
      expect(await rewardEthToken.balanceOf(beneficiary)).to.bignumber.equal(
        prevReward
      );
    });

    it('anyone can collect reward for beneficiary', async () => {
      let receipt = await revenueSharing.collectReward(beneficiary, {
        from: anyone,
      });
      await expectEvent(receipt, 'RewardCollected', {
        sender: anyone,
        beneficiary,
      });
      const reward = receipt.logs[0].args.reward;
      expect(reward).to.bignumber.greaterThan(new BN(0));
      expect(reward).to.bignumber.equal(revenueCut);
      expect(await revenueSharing.rewardOf(beneficiary)).to.bignumber.equal(
        new BN(0)
      );
    });

    it('anyone can collect rewards for multiple beneficiaries', async () => {
      let beneficiary1 = beneficiary;
      let [beneficiary2, revenueShare2, contributedAmount2] = [
        otherAccounts[0],
        revenueShare.add(new BN(1000)),
        contributedAmount.add(ether('30')),
      ];

      // add another account and increase contributed amount
      await revenueSharing.addAccount(beneficiary2, revenueShare2, {
        from: admin,
      });
      await revenueSharing.increaseAmount(beneficiary2, contributedAmount2, {
        from: admin,
      });

      // increase reward
      let periodReward = ether('10');
      let totalRewards = (await rewardEthToken.totalRewards()).add(
        periodReward
      );
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });
      revenueCut = await rewardEthToken.balanceOf(revenueSharing.address);

      let receipt = await revenueSharing.collectRewards(
        [beneficiary1, beneficiary2],
        {
          from: anyone,
        }
      );

      await expectEvent(receipt, 'RewardCollected', {
        sender: anyone,
        beneficiary: beneficiary1,
      });
      await expectEvent(receipt, 'RewardCollected', {
        sender: anyone,
        beneficiary: beneficiary2,
      });

      // check reward of the beneficiary1
      const reward1 = receipt.logs[0].args.reward;
      expect(reward1).to.bignumber.greaterThan(new BN(0));
      expect(await revenueSharing.rewardOf(beneficiary1)).to.bignumber.equal(
        new BN(0)
      );

      // check reward of the beneficiary2
      const reward2 = receipt.logs[1].args.reward;
      expect(reward2).to.bignumber.greaterThan(new BN(0));
      expect(await revenueSharing.rewardOf(beneficiary2)).to.bignumber.equal(
        new BN(0)
      );
      expect(reward1.add(reward2)).to.bignumber.lessThan(revenueCut);
      expect(reward2).to.bignumber.greaterThan(reward1);
    });
  });

  describe('updateRewards', () => {
    it('fails to update rewards by not RewardEthToken', async () => {
      await expectRevert(
        revenueSharing.updateRewards(ether('5'), ether('1000'), {
          from: anyone,
        }),
        'RevenueSharing: access denied'
      );
    });

    it('fails to update rewards when paused', async () => {
      await revenueSharing.pause({ from: admin });
      await expectRevert(
        revenueSharing.updateRewards(ether('5'), ether('1000'), {
          from: beneficiary,
        }),
        'Pausable: paused'
      );
    });
  });
});
