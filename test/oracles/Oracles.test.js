const { expect } = require('chai');
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

  describe('oracles voting', () => {
    let prevTotalRewards,
      newTotalRewards,
      currentNonce,
      pendingValidators,
      activatedValidators,
      oracleAccounts;

    beforeEach(async () => {
      oracleAccounts = await getOracleAccounts({ oracles });
      for (const oracleAccount of oracleAccounts) {
        await send.ether(anyone, oracleAccount, ether('2'));
      }

      prevTotalRewards = await rewardEthToken.totalRewards();
      newTotalRewards = prevTotalRewards.add(ether('10'));
      currentNonce = await oracles.currentNonce();

      activatedValidators = new BN(contractSettings.activatedValidators);
      pendingValidators = new BN(contractSettings.pendingValidators);
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.vote(newTotalRewards, activatedValidators, {
          from: oracleAccounts[0],
        }),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.vote(newTotalRewards, activatedValidators, {
          from: anyone,
        }),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await oracles.vote(newTotalRewards, activatedValidators, {
        from: oracleAccounts[0],
      });
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activatedValidators
        )
      ).to.equal(true);

      await expectRevert(
        oracles.vote(newTotalRewards, activatedValidators, {
          from: oracleAccounts[0],
        }),
        'Oracles: already voted'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      const receipt = await oracles.vote(newTotalRewards, activatedValidators, {
        from: oracleAccounts[0],
      });
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activatedValidators,
        nonce: currentNonce,
      });
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activatedValidators
        )
      ).to.equal(true);
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        prevTotalRewards
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        new BN(activatedValidators)
      );
      expect(await pool.pendingValidators()).to.bignumber.equal(
        pendingValidators
      );
    });

    it('submits data when enough votes collected', async () => {
      let newActivatedValidators = activatedValidators.add(pendingValidators);
      for (let i = 0; i < oracleAccounts.length; i++) {
        let receipt = await oracles.vote(
          newTotalRewards,
          newActivatedValidators,
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
            newActivatedValidators
          )
        ).to.equal(true);
        expectEvent(receipt, 'VoteSubmitted', {
          oracle: oracleAccounts[i],
          totalRewards: newTotalRewards,
          activatedValidators: newActivatedValidators,
          nonce: currentNonce,
        });
      }

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        newTotalRewards
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        newActivatedValidators
      );
      expect(await pool.pendingValidators()).to.bignumber.equal(new BN(0));

      // new vote comes with different nonce
      let receipt = await oracles.vote(
        newTotalRewards,
        newActivatedValidators,
        {
          from: oracleAccounts[0],
        }
      );
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          newActivatedValidators
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activatedValidators: newActivatedValidators,
        nonce: currentNonce.add(new BN(1)),
      });
    });

    it('does not update activation data when did not change', async () => {
      activatedValidators = new BN(contractSettings.activatedValidators);
      pendingValidators = await pool.pendingValidators();

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.vote(newTotalRewards, activatedValidators, {
          from: oracleAccounts[i],
        });
        if (!prevTotalRewards.eq(await rewardEthToken.totalRewards())) {
          // data submitted
          break;
        }
      }

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        newTotalRewards
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
      expect(await pool.pendingValidators()).to.bignumber.equal(
        pendingValidators
      );
    });
  });
});
