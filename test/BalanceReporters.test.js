const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  deployBalanceReporters,
  initializeBalanceReporters,
} = require('../deployments/validators');
const {
  deployRewardEthToken,
  deployStakedEthToken,
  initializeRewardEthToken,
  initializeStakedEthToken,
} = require('../deployments/tokens');

const RewardEthToken = artifacts.require('RewardEthToken');
const StakedEthToken = artifacts.require('StakedEthToken');
const BalanceReporters = artifacts.require('BalanceReporters');

const totalRewardsUpdatePeriod = '86400';

contract('BalanceReporters', ([_, ...accounts]) => {
  let balanceReporters, rewardEthToken, stakedEthToken;
  let [
    admin,
    reporter,
    anotherReporter,
    poolContractAddress,
    stakedTokensContractAddress,
    anyone,
    ...otherAccounts
  ] = accounts;

  beforeEach(async () => {
    const stakedEthTokenContractAddress = await deployStakedEthToken();
    const rewardEthTokenContractAddress = await deployRewardEthToken();
    const balanceReportersContractAddress = await deployBalanceReporters();
    await initializeStakedEthToken(
      stakedEthTokenContractAddress,
      admin,
      rewardEthTokenContractAddress,
      poolContractAddress
    );
    await initializeRewardEthToken(
      rewardEthTokenContractAddress,
      admin,
      stakedEthTokenContractAddress,
      balanceReportersContractAddress,
      stakedTokensContractAddress
    );

    await initializeBalanceReporters(
      balanceReportersContractAddress,
      admin,
      rewardEthTokenContractAddress,
      totalRewardsUpdatePeriod
    );

    balanceReporters = await BalanceReporters.at(
      balanceReportersContractAddress
    );
    rewardEthToken = await RewardEthToken.at(rewardEthTokenContractAddress);
    stakedEthToken = await StakedEthToken.at(stakedEthTokenContractAddress);
  });

  describe('assigning', () => {
    it('admin can assign reporter role to another account', async () => {
      const receipt = await balanceReporters.addReporter(reporter, {
        from: admin,
      });
      expectEvent(receipt, 'RoleGranted', {
        role: await balanceReporters.REPORTER_ROLE(),
        account: reporter,
        sender: admin,
      });
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(admin)).equal(false);
      expect(await balanceReporters.isReporter(anyone)).equal(false);
    });

    it('others cannot assign reporter role to an account', async () => {
      await expectRevert(
        balanceReporters.addReporter(reporter, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(false);
      expect(await balanceReporters.isReporter(anyone)).equal(false);
    });

    it('reporters cannot assign reporter role to others', async () => {
      await balanceReporters.addReporter(reporter, { from: admin });
      await expectRevert(
        balanceReporters.addReporter(anotherReporter, { from: reporter }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await balanceReporters.addReporter(reporter, { from: admin });
      await balanceReporters.addReporter(anotherReporter, { from: admin });
    });

    it('anyone cannot remove reporters', async () => {
      await expectRevert(
        balanceReporters.removeReporter(reporter, { from: anyone }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });

    it('reporter cannot remove other reporters', async () => {
      await expectRevert(
        balanceReporters.removeReporter(anotherReporter, { from: reporter }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });

    it('admins can remove reporters', async () => {
      const receipt = await balanceReporters.removeReporter(reporter, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await balanceReporters.REPORTER_ROLE(),
        account: reporter,
        sender: admin,
      });
      expect(await balanceReporters.isReporter(reporter)).equal(false);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });
  });

  describe('uniswap pairs', () => {
    let [pair1, pair2, pair3] = otherAccounts;
    let pairs = [pair1, pair2, pair3];

    it('admin user can set rwETH uniswap pairs', async () => {
      const receipt = await balanceReporters.setRewardEthUniswapPairs(pairs, {
        from: admin,
      });
      expectEvent(receipt, 'RewardEthUniswapPairsUpdated', {
        rewardEthUniswapPairs: pairs,
      });
      expect(await balanceReporters.getRewardEthUniswapPairs()).to.have.members(
        pairs
      );
    });

    it('anyone cannot set rwETH uniswap pairs', async () => {
      await expectRevert(
        balanceReporters.setRewardEthUniswapPairs(pairs, { from: anyone }),
        'OwnablePausable: access denied'
      );
      expect(await balanceReporters.getRewardEthUniswapPairs()).to.have.members(
        []
      );
    });
  });

  describe('total rewards update period', () => {
    it('admin user update total rewards period', async () => {
      let newTotalRewardsUpdatePeriod = new BN('172800');
      const receipt = await balanceReporters.setTotalRewardsUpdatePeriod(
        newTotalRewardsUpdatePeriod,
        {
          from: admin,
        }
      );
      expectEvent(receipt, 'TotalRewardsUpdatePeriodUpdated', {
        totalRewardsUpdatePeriod: newTotalRewardsUpdatePeriod,
      });
      expect(await balanceReporters.totalRewardsUpdatePeriod()).bignumber.equal(
        newTotalRewardsUpdatePeriod
      );
    });

    it('anyone cannot update total rewards period', async () => {
      let newTotalRewardsUpdatePeriod = new BN('172800');
      await expectRevert(
        balanceReporters.setTotalRewardsUpdatePeriod(
          newTotalRewardsUpdatePeriod,
          { from: anyone }
        ),
        'OwnablePausable: access denied'
      );
      expect(await balanceReporters.totalRewardsUpdatePeriod()).bignumber.equal(
        new BN(totalRewardsUpdatePeriod)
      );
    });
  });

  describe('total rewards voting', () => {
    let [reporter1, reporter2, reporter3, reporter4] = otherAccounts;

    beforeEach(async () => {
      await balanceReporters.addReporter(reporter1, { from: admin });
      await balanceReporters.addReporter(reporter2, { from: admin });
      await balanceReporters.addReporter(reporter3, { from: admin });
      await balanceReporters.addReporter(reporter4, { from: admin });

      await stakedEthToken.mint(anyone, ether('32'), {
        from: poolContractAddress,
      });
    });

    it('fails to vote when contract is paused', async () => {
      await balanceReporters.pause({ from: admin });
      expect(await balanceReporters.paused()).equal(true);

      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: reporter1,
        }),
        'Pausable: paused'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('only reporter can submit new total rewards', async () => {
      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: anyone,
        }),
        'BalanceReporters: access denied'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('cannot vote for the same total rewards twice', async () => {
      await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expect(
        await balanceReporters.hasTotalRewardsVote(reporter1, ether('1'))
      ).to.equal(true);
      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: reporter1,
        }),
        'BalanceReporters: already voted'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('does not submit rewards when not enough votes', async () => {
      const receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        reporter: reporter1,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });
      expect(
        await balanceReporters.hasTotalRewardsVote(reporter1, ether('1'))
      ).to.equal(true);
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('submits total rewards when enough votes collected', async () => {
      // reporter 1 submits
      let receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expect(
        await balanceReporters.hasTotalRewardsVote(reporter1, ether('1'))
      ).to.equal(true);
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        reporter: reporter1,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // reporter 2 submits
      receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter2,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        reporter: reporter2,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // reporter 3 submits
      receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter3,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        reporter: reporter3,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        ether('1')
      );

      // vote again
      receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expect(
        await balanceReporters.hasTotalRewardsVote(reporter1, ether('1'))
      ).to.equal(true);
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        reporter: reporter1,
        totalRewards: ether('1'),
        nonce: new BN(1),
      });
    });
  });
});
