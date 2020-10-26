const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
  ether,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
  deployBalanceReporters,
  initializeBalanceReporters,
} = require('../../deployments/access');
const { deployAndInitializeSettings } = require('../../deployments/settings');
const {
  deployRewardEthToken,
  deployStakingEthToken,
  initializeRewardEthToken,
  initializeStakingEthToken,
} = require('../../deployments/tokens');

const Admins = artifacts.require('Admins');
const RewardEthToken = artifacts.require('RewardEthToken');
const StakingEthToken = artifacts.require('StakingEthToken');
const Settings = artifacts.require('Settings');
const BalanceReporters = artifacts.require('BalanceReporters');

contract('BalanceReporters', ([_, ...accounts]) => {
  let admins, settings, balanceReporters, rewardEthToken, stakingEthToken;
  let [
    admin,
    reporter,
    anotherReporter,
    poolContractAddress,
    anyone,
    ...otherAccounts
  ] = accounts;

  before(async () => {
    admins = await Admins.at(await deployAndInitializeAdmins(admin));
    let operatorsContractAddress = await deployAndInitializeOperators(
      admins.address
    );
    settings = await Settings.at(
      await deployAndInitializeSettings(
        admins.address,
        operatorsContractAddress
      )
    );
  });

  beforeEach(async () => {
    const stakingEthTokenContractAddress = await deployStakingEthToken();
    const rewardEthTokenContractAddress = await deployRewardEthToken();
    const balanceReportersContractAddress = await deployBalanceReporters();
    await initializeStakingEthToken(
      stakingEthTokenContractAddress,
      rewardEthTokenContractAddress,
      settings.address,
      poolContractAddress
    );
    await initializeRewardEthToken(
      rewardEthTokenContractAddress,
      stakingEthTokenContractAddress,
      settings.address,
      balanceReportersContractAddress
    );

    await initializeBalanceReporters(
      balanceReportersContractAddress,
      admins.address,
      settings.address,
      rewardEthTokenContractAddress
    );

    balanceReporters = await BalanceReporters.at(
      balanceReportersContractAddress
    );
    rewardEthToken = await RewardEthToken.at(rewardEthTokenContractAddress);
    stakingEthToken = await StakingEthToken.at(stakingEthTokenContractAddress);
  });

  describe('assigning', () => {
    it('admin can assign reporter role to another account', async () => {
      const receipt = await balanceReporters.addReporter(reporter, {
        from: admin,
      });
      expectEvent(receipt, 'ReporterAdded', {
        account: reporter,
      });
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(admin)).equal(false);
      expect(await balanceReporters.isReporter(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        balanceReporters.addReporter(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned reporter role multiple times', async () => {
      await balanceReporters.addReporter(reporter, { from: admin });
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      await expectRevert(
        balanceReporters.addReporter(reporter, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('others cannot assign reporter role to an account', async () => {
      await expectRevert(
        balanceReporters.addReporter(reporter, { from: anyone }),
        'BalanceReporters: only admin users can assign reporters'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(false);
      expect(await balanceReporters.isReporter(anyone)).equal(false);
    });

    it('reporters cannot assign reporter role to others', async () => {
      await balanceReporters.addReporter(reporter, { from: admin });
      await expectRevert(
        balanceReporters.addReporter(anotherReporter, { from: reporter }),
        'BalanceReporters: only admin users can assign reporters'
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
        'BalanceReporters: only admin users can remove reporters'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });

    it('reporter cannot remove other reporters', async () => {
      await expectRevert(
        balanceReporters.removeReporter(anotherReporter, { from: reporter }),
        'BalanceReporters: only admin users can remove reporters'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });

    it('cannot remove account without reporter role', async () => {
      await expectRevert(
        balanceReporters.removeReporter(anyone, { from: admin }),
        'Roles: account does not have role'
      );
      expect(await balanceReporters.isReporter(reporter)).equal(true);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });

    it('admins can remove reporters', async () => {
      const receipt = await balanceReporters.removeReporter(reporter, {
        from: admin,
      });
      expectEvent(receipt, 'ReporterRemoved', {
        account: reporter,
      });
      expect(await balanceReporters.isReporter(reporter)).equal(false);
      expect(await balanceReporters.isReporter(anotherReporter)).equal(true);
    });
  });

  describe('total rewards voting', () => {
    let [reporter1, reporter2, reporter3] = otherAccounts;

    beforeEach(async () => {
      await balanceReporters.addReporter(reporter1, { from: admin });
      await balanceReporters.addReporter(reporter2, { from: admin });
      await balanceReporters.addReporter(reporter3, { from: admin });

      await stakingEthToken.mint(anyone, ether('32'), {
        from: poolContractAddress,
      });
    });

    it('fails to vote when contract is paused', async () => {
      await settings.setPausedContracts(balanceReporters.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(balanceReporters.address)).equal(
        true
      );

      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: reporter1,
        }),
        'BalanceReporters: contract is paused'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('only reporter can submit new total rewards', async () => {
      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: anyone,
        }),
        'BalanceReporters: permission denied'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('cannot vote for the same total rewards twice', async () => {
      await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expect(await balanceReporters.hasVoted(reporter1, ether('1'))).to.equal(
        true
      );
      await expectRevert(
        balanceReporters.voteForTotalRewards(ether('1'), {
          from: reporter1,
        }),
        'BalanceReporters: vote was already submitted'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('does not submit rewards when not enough votes', async () => {
      const receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expectEvent(receipt, 'VoteSubmitted', {
        reporter: reporter1,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });
      expect(await balanceReporters.hasVoted(reporter1, ether('1'))).to.equal(
        true
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('submits total rewards when enough votes collected', async () => {
      // reporter 1 submits
      let receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter1,
      });
      expect(await balanceReporters.hasVoted(reporter1, ether('1'))).to.equal(
        true
      );
      expectEvent(receipt, 'VoteSubmitted', {
        reporter: reporter1,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });

      // reporter 2 submits
      receipt = await balanceReporters.voteForTotalRewards(ether('1'), {
        from: reporter2,
      });
      expectEvent(receipt, 'VoteSubmitted', {
        reporter: reporter2,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        ether('1')
      );
    });
  });
});
