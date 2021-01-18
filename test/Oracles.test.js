const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  deployOracles,
  initializeOracles,
} = require('../deployments/validators');
const {
  deployRewardEthToken,
  deployStakedEthToken,
  initializeRewardEthToken,
  initializeStakedEthToken,
} = require('../deployments/tokens');

const RewardEthToken = artifacts.require('RewardEthToken');
const StakedEthToken = artifacts.require('StakedEthToken');
const Oracles = artifacts.require('Oracles');

const totalRewardsUpdatePeriod = '86400';

contract('Oracles', ([_, ...accounts]) => {
  let oracles, rewardEthToken, stakedEthToken;
  let [
    admin,
    oracle,
    anotherOracle,
    poolContractAddress,
    stakedTokensContractAddress,
    anyone,
    ...otherAccounts
  ] = accounts;

  beforeEach(async () => {
    const stakedEthTokenContractAddress = await deployStakedEthToken();
    const rewardEthTokenContractAddress = await deployRewardEthToken();
    const oraclesContractAddress = await deployOracles();
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
      oraclesContractAddress,
      stakedTokensContractAddress
    );

    await initializeOracles(
      oraclesContractAddress,
      admin,
      rewardEthTokenContractAddress,
      totalRewardsUpdatePeriod
    );

    oracles = await Oracles.at(oraclesContractAddress);
    rewardEthToken = await RewardEthToken.at(rewardEthTokenContractAddress);
    stakedEthToken = await StakedEthToken.at(stakedEthTokenContractAddress);
  });

  describe('assigning', () => {
    it('admin can assign oracle role to another account', async () => {
      const receipt = await oracles.addOracle(oracle, {
        from: admin,
      });
      expectEvent(receipt, 'RoleGranted', {
        role: await oracles.ORACLE_ROLE(),
        account: oracle,
        sender: admin,
      });
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(admin)).equal(false);
      expect(await oracles.isOracle(anyone)).equal(false);
    });

    it('others cannot assign oracle role to an account', async () => {
      await expectRevert(
        oracles.addOracle(oracle, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await oracles.isOracle(oracle)).equal(false);
      expect(await oracles.isOracle(anyone)).equal(false);
    });

    it('oracles cannot assign oracle role to others', async () => {
      await oracles.addOracle(oracle, { from: admin });
      await expectRevert(
        oracles.addOracle(anotherOracle, { from: oracle }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(anotherOracle)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await oracles.addOracle(oracle, { from: admin });
      await oracles.addOracle(anotherOracle, { from: admin });
    });

    it('anyone cannot remove oracles', async () => {
      await expectRevert(
        oracles.removeOracle(oracle, { from: anyone }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(anotherOracle)).equal(true);
    });

    it('oracle cannot remove other oracles', async () => {
      await expectRevert(
        oracles.removeOracle(anotherOracle, { from: oracle }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(anotherOracle)).equal(true);
    });

    it('admins can remove oracles', async () => {
      const receipt = await oracles.removeOracle(oracle, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await oracles.ORACLE_ROLE(),
        account: oracle,
        sender: admin,
      });
      expect(await oracles.isOracle(oracle)).equal(false);
      expect(await oracles.isOracle(anotherOracle)).equal(true);
    });
  });

  describe('uniswap pairs', () => {
    let [pair1, pair2, pair3] = otherAccounts;
    let pairs = [pair1, pair2, pair3];

    it('admin user can set rETH2 uniswap pairs', async () => {
      const receipt = await oracles.setRewardEthUniswapPairs(pairs, {
        from: admin,
      });
      expectEvent(receipt, 'RewardEthUniswapPairsUpdated', {
        rewardEthUniswapPairs: pairs,
      });
      expect(await oracles.getRewardEthUniswapPairs()).to.have.members(pairs);
    });

    it('anyone cannot set rETH2 uniswap pairs', async () => {
      await expectRevert(
        oracles.setRewardEthUniswapPairs(pairs, { from: anyone }),
        'OwnablePausable: access denied'
      );
      expect(await oracles.getRewardEthUniswapPairs()).to.have.members([]);
    });
  });

  describe('total rewards update period', () => {
    it('admin user update total rewards period', async () => {
      let newTotalRewardsUpdatePeriod = new BN('172800');
      const receipt = await oracles.setTotalRewardsUpdatePeriod(
        newTotalRewardsUpdatePeriod,
        {
          from: admin,
        }
      );
      expectEvent(receipt, 'TotalRewardsUpdatePeriodUpdated', {
        totalRewardsUpdatePeriod: newTotalRewardsUpdatePeriod,
      });
      expect(await oracles.totalRewardsUpdatePeriod()).bignumber.equal(
        newTotalRewardsUpdatePeriod
      );
    });

    it('anyone cannot update total rewards period', async () => {
      let newTotalRewardsUpdatePeriod = new BN('172800');
      await expectRevert(
        oracles.setTotalRewardsUpdatePeriod(newTotalRewardsUpdatePeriod, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
      expect(await oracles.totalRewardsUpdatePeriod()).bignumber.equal(
        new BN(totalRewardsUpdatePeriod)
      );
    });
  });

  describe('total rewards voting', () => {
    let [oracle1, oracle2, oracle3, oracle4] = otherAccounts;

    beforeEach(async () => {
      await oracles.addOracle(oracle1, { from: admin });
      await oracles.addOracle(oracle2, { from: admin });
      await oracles.addOracle(oracle3, { from: admin });
      await oracles.addOracle(oracle4, { from: admin });

      await stakedEthToken.mint(anyone, ether('32'), {
        from: poolContractAddress,
      });
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.voteForTotalRewards(ether('1'), {
          from: oracle1,
        }),
        'Pausable: paused'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('only oracle can submit new total rewards', async () => {
      await expectRevert(
        oracles.voteForTotalRewards(ether('1'), {
          from: anyone,
        }),
        'Oracles: access denied'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('cannot vote for the same total rewards twice', async () => {
      await oracles.voteForTotalRewards(ether('1'), {
        from: oracle1,
      });
      expect(await oracles.hasTotalRewardsVote(oracle1, ether('1'))).to.equal(
        true
      );
      await expectRevert(
        oracles.voteForTotalRewards(ether('1'), {
          from: oracle1,
        }),
        'Oracles: already voted'
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('does not submit rewards when not enough votes', async () => {
      const receipt = await oracles.voteForTotalRewards(ether('1'), {
        from: oracle1,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        oracle: oracle1,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });
      expect(await oracles.hasTotalRewardsVote(oracle1, ether('1'))).to.equal(
        true
      );
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('submits total rewards when enough votes collected', async () => {
      // oracle 1 submits
      let receipt = await oracles.voteForTotalRewards(ether('1'), {
        from: oracle1,
      });
      expect(await oracles.hasTotalRewardsVote(oracle1, ether('1'))).to.equal(
        true
      );
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        oracle: oracle1,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // oracle 2 submits
      receipt = await oracles.voteForTotalRewards(ether('1'), {
        from: oracle2,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        oracle: oracle2,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // oracle 3 submits
      receipt = await oracles.voteForTotalRewards(ether('1'), {
        from: oracle3,
      });
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        oracle: oracle3,
        totalRewards: ether('1'),
        nonce: new BN(0),
      });

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        ether('1')
      );

      // vote again
      receipt = await oracles.voteForTotalRewards(ether('1'), {
        from: oracle1,
      });
      expect(await oracles.hasTotalRewardsVote(oracle1, ether('1'))).to.equal(
        true
      );
      expectEvent(receipt, 'TotalRewardsVoteSubmitted', {
        oracle: oracle1,
        totalRewards: ether('1'),
        nonce: new BN(1),
      });
    });
  });
});
