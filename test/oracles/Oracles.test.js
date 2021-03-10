const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  BN,
  time,
  send,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  getOracleAccounts,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

contract('Oracles', ([_, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles, rewardEthToken, pool;
  let [oracle, anotherOracle, anyone] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
  });

  afterEach(async () => resetFork());

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

  describe('oracles sync period', () => {
    it('admin user can update sync period', async () => {
      let newSyncPeriod = new BN('172800');
      const receipt = await oracles.setSyncPeriod(newSyncPeriod, {
        from: admin,
      });
      expectEvent(receipt, 'SyncPeriodUpdated', {
        syncPeriod: newSyncPeriod,
        sender: admin,
      });
      expect(await oracles.syncPeriod()).bignumber.equal(newSyncPeriod);
    });

    it('anyone cannot update oracles sync period', async () => {
      let newSyncPeriod = new BN('172800');
      await expectRevert(
        oracles.setSyncPeriod(newSyncPeriod, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
      expect(await oracles.syncPeriod()).bignumber.equal(
        new BN(contractSettings.oraclesSyncPeriod)
      );
    });
  });

  describe('deposits activation toggling', () => {
    it('admin user can toggle deposits activation', async () => {
      const receipt = await oracles.toggleDepositsActivation(false, {
        from: admin,
      });
      expectEvent(receipt, 'DepositsActivationToggled', {
        enabled: false,
        sender: admin,
      });
      expect(await oracles.depositsActivationEnabled()).equal(false);
    });

    it('anyone cannot toggle deposits activation', async () => {
      await expectRevert(
        oracles.toggleDepositsActivation(false, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });
  });

  describe('oracles voting', () => {
    let oracleAccounts = [];
    let activationDuration = time.duration.days(7);
    let totalStakingAmount = ether('500');
    let prevTotalRewards, newTotalRewards, currentNonce;

    beforeEach(async () => {
      oracleAccounts = await getOracleAccounts({ oracles });
      prevTotalRewards = await rewardEthToken.totalRewards();
      newTotalRewards = prevTotalRewards.add(ether('10'));
      currentNonce = await oracles.currentNonce();
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.vote(newTotalRewards, activationDuration, totalStakingAmount, {
          from: oracleAccounts[0],
        }),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.vote(newTotalRewards, activationDuration, totalStakingAmount, {
          from: anyone,
        }),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await oracles.vote(
        newTotalRewards,
        activationDuration,
        totalStakingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          totalStakingAmount
        )
      ).to.equal(true);

      await expectRevert(
        oracles.vote(newTotalRewards, activationDuration, totalStakingAmount, {
          from: oracleAccounts[0],
        }),
        'Oracles: already voted'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      const receipt = await oracles.vote(
        newTotalRewards,
        activationDuration,
        totalStakingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activationDuration,
        totalStakingAmount,
        nonce: currentNonce,
      });
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          totalStakingAmount
        )
      ).to.equal(true);
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        prevTotalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        new BN(contractSettings.activationDuration)
      );
      expect(await pool.totalStakingAmount()).to.bignumber.equal(
        new BN(contractSettings.totalStakingAmount)
      );
    });

    it('submits data when enough votes collected', async () => {
      for (let i = 0; i < oracleAccounts.length; i++) {
        let receipt = await oracles.vote(
          newTotalRewards,
          activationDuration,
          totalStakingAmount,
          {
            from: oracleAccounts[i],
          }
        );
        if (!prevTotalRewards.eq(await rewardEthToken.totalRewards())) {
          // data submitted
          break;
        }
        expect(
          await oracles.hasVote(
            oracleAccounts[i],
            newTotalRewards,
            activationDuration,
            totalStakingAmount
          )
        ).to.equal(true);
        expectEvent(receipt, 'VoteSubmitted', {
          oracle: oracleAccounts[i],
          totalRewards: newTotalRewards,
          activationDuration,
          totalStakingAmount,
          nonce: currentNonce,
        });
      }

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        newTotalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
      expect(await pool.totalStakingAmount()).to.bignumber.equal(
        totalStakingAmount
      );

      // new vote comes with different nonce
      let receipt = await oracles.vote(
        newTotalRewards,
        activationDuration,
        totalStakingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          totalStakingAmount
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activationDuration,
        totalStakingAmount,
        nonce: currentNonce.add(new BN(1)),
      });
    });

    it('does not update activation data when did not change', async () => {
      activationDuration = new BN(contractSettings.activationDuration);
      totalStakingAmount = new BN(contractSettings.totalStakingAmount);

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.vote(
          newTotalRewards,
          activationDuration,
          totalStakingAmount,
          {
            from: oracleAccounts[i],
          }
        );
        if (!prevTotalRewards.eq(await rewardEthToken.totalRewards())) {
          // data submitted
          break;
        }
      }

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        newTotalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
      expect(await pool.totalStakingAmount()).to.bignumber.equal(
        totalStakingAmount
      );
    });

    it('does not update activation data when activation disabled', async () => {
      await oracles.toggleDepositsActivation(false, {
        from: admin,
      });

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.vote(
          newTotalRewards,
          activationDuration,
          totalStakingAmount,
          {
            from: oracleAccounts[i],
          }
        );
        if (!prevTotalRewards.eq(await rewardEthToken.totalRewards())) {
          // data submitted
          break;
        }
      }

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        newTotalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        new BN(contractSettings.activationDuration)
      );
      expect(await pool.totalStakingAmount()).to.bignumber.equal(
        new BN(contractSettings.totalStakingAmount)
      );
    });
  });
});
