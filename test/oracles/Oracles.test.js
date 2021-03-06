const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  BN,
  time,
  balance,
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
  let oracles, rewardEthToken, pool;
  let [oracle, anotherOracle, anyone] = accounts;

  after(async () => stopImpersonatingAccount(contractSettings.admin));

  beforeEach(async () => {
    await impersonateAccount(contractSettings.admin);
    await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
  });

  afterEach(async () => resetFork());

  describe('assigning', () => {
    it('admin can assign oracle role to another account', async () => {
      const receipt = await oracles.addOracle(oracle, {
        from: contractSettings.admin,
      });
      expectEvent(receipt, 'RoleGranted', {
        role: await oracles.ORACLE_ROLE(),
        account: oracle,
        sender: contractSettings.admin,
      });
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(contractSettings.admin)).equal(false);
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
      await oracles.addOracle(oracle, { from: contractSettings.admin });
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
      await oracles.addOracle(oracle, { from: contractSettings.admin });
      await oracles.addOracle(anotherOracle, { from: contractSettings.admin });
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
        from: contractSettings.admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await oracles.ORACLE_ROLE(),
        account: oracle,
        sender: contractSettings.admin,
      });
      expect(await oracles.isOracle(oracle)).equal(false);
      expect(await oracles.isOracle(anotherOracle)).equal(true);
    });
  });

  describe('oracles sync period', () => {
    it('admin user can update sync period', async () => {
      let newSyncPeriod = new BN('172800');
      const receipt = await oracles.setSyncPeriod(newSyncPeriod, {
        from: contractSettings.admin,
      });
      expectEvent(receipt, 'SyncPeriodUpdated', {
        syncPeriod: newSyncPeriod,
        sender: contractSettings.admin,
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
        from: contractSettings.admin,
      });
      expectEvent(receipt, 'DepositsActivationToggled', {
        enabled: false,
        sender: contractSettings.admin,
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
    let beaconActivatingAmount = ether('500');
    let poolDeposit, prevTotalRewards, newTotalRewards, currentNonce;

    beforeEach(async () => {
      oracleAccounts = await getOracleAccounts({ oracles });
      prevTotalRewards = await rewardEthToken.totalRewards();
      newTotalRewards = prevTotalRewards.add(ether('10'));
      poolDeposit = await balance.current(pool.address);
      currentNonce = await oracles.currentNonce();
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: contractSettings.admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
          {
            from: oracleAccounts[0],
          }
        ),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
          {
            from: anyone,
          }
        ),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await oracles.vote(
        newTotalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);

      await expectRevert(
        oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: already voted'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      const receipt = await oracles.vote(
        newTotalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: currentNonce,
      });
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        prevTotalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        new BN(contractSettings.activationDuration)
      );
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        new BN(contractSettings.beaconActivatingAmount).add(poolDeposit)
      );
    });

    it('submits data when enough votes collected', async () => {
      for (let i = 0; i < oracleAccounts.length; i++) {
        let receipt = await oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
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
            beaconActivatingAmount
          )
        ).to.equal(true);
        expectEvent(receipt, 'VoteSubmitted', {
          oracle: oracleAccounts[i],
          totalRewards: newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
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
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        beaconActivatingAmount.add(poolDeposit)
      );

      // new vote comes with different nonce
      let receipt = await oracles.vote(
        newTotalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracleAccounts[0],
        }
      );
      expect(
        await oracles.hasVote(
          oracleAccounts[0],
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: currentNonce.add(new BN(1)),
      });
    });

    it('does not update activation data when did not change', async () => {
      activationDuration = new BN(contractSettings.activationDuration);
      beaconActivatingAmount = new BN(contractSettings.beaconActivatingAmount);

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
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
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        beaconActivatingAmount.add(poolDeposit)
      );
    });

    it('does not update activation data when activation disabled', async () => {
      await oracles.toggleDepositsActivation(false, {
        from: contractSettings.admin,
      });

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.vote(
          newTotalRewards,
          activationDuration,
          beaconActivatingAmount,
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
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        new BN(contractSettings.beaconActivatingAmount).add(poolDeposit)
      );
    });
  });
});
