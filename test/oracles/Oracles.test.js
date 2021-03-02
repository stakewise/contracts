const { upgrades } = require('hardhat');
const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  BN,
  time,
} = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../../deployments/settings');
const {
  deployAllContracts,
  upgradeAllContracts,
} = require('../../deployments');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

contract('Oracles', ([_, ...accounts]) => {
  let oracles, rewardEthToken, pool;
  let [admin, oracle, anotherOracle, anyone, ...otherAccounts] = accounts;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      oracles: oraclesContractAddress,
      rewardEthToken: rewardEthTokenContractAddress,
    } = await deployAllContracts({ initialAdmin: admin });

    const proxyAdmin = await upgrades.admin.getInstance();
    oracles = await Oracles.at(oraclesContractAddress);
    pool = await Pool.at(poolContractAddress);
    await pool.addAdmin(proxyAdmin.address, { from: admin });
    await oracles.addAdmin(proxyAdmin.address, { from: admin });

    await oracles.pause({ from: admin });
    await pool.pause({ from: admin });
    await upgradeAllContracts({ poolContractAddress, oraclesContractAddress });
    await oracles.unpause({ from: admin });
    await pool.unpause({ from: admin });

    rewardEthToken = await RewardEthToken.at(rewardEthTokenContractAddress);
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
        new BN(initialSettings.oraclesSyncPeriod)
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
    let [oracle1, oracle2, oracle3, oracle4] = otherAccounts;
    let totalRewards = ether('1');
    let activationDuration = time.duration.days(7);
    let beaconActivatingAmount = ether('500');
    let poolDeposit = ether('1');

    beforeEach(async () => {
      await oracles.addOracle(oracle1, { from: admin });
      await oracles.addOracle(oracle2, { from: admin });
      await oracles.addOracle(oracle3, { from: admin });
      await oracles.addOracle(oracle4, { from: admin });

      await pool.addDeposit({
        from: anyone,
        value: poolDeposit,
      });
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.vote(totalRewards, activationDuration, beaconActivatingAmount, {
          from: oracle1,
        }),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.vote(totalRewards, activationDuration, beaconActivatingAmount, {
          from: anyone,
        }),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );
      expect(
        await oracles.hasVote(
          oracle1,
          totalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      await time.increase(initialSettings.oraclesSyncPeriod);

      await expectRevert(
        oracles.vote(totalRewards, activationDuration, beaconActivatingAmount, {
          from: oracle1,
        }),
        'Oracles: already voted'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      const receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle1,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });
      expect(
        await oracles.hasVote(
          oracle1,
          totalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(new BN(0));
      expect(await pool.activationDuration()).to.bignumber.equal(
        new BN(initialSettings.activationDuration)
      );
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        new BN(initialSettings.beaconActivatingAmount).add(poolDeposit)
      );
    });

    it('submits data when enough votes collected', async () => {
      // oracle 1 submits
      let receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );
      expect(
        await oracles.hasVote(
          oracle1,
          totalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle1,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // oracle 2 submits
      receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle2,
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle2,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // oracle 3 submits
      receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle3,
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle3,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        totalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        beaconActivatingAmount.add(poolDeposit)
      );

      // early vote gets reverted
      await expectRevert(
        oracles.vote(totalRewards, activationDuration, beaconActivatingAmount, {
          from: oracle1,
        }),
        'Oracles: vote submitted too early'
      );

      // new vote comes with different nonce
      await time.increase(initialSettings.oraclesSyncPeriod);
      receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );
      expect(
        await oracles.hasVote(
          oracle1,
          totalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle1,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(1),
      });
    });

    it('does not update activation data when did not change', async () => {
      activationDuration = new BN(initialSettings.activationDuration);
      beaconActivatingAmount = new BN(initialSettings.beaconActivatingAmount);

      // oracle 1 submits
      let receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );
      expect(
        await oracles.hasVote(
          oracle1,
          totalRewards,
          activationDuration,
          beaconActivatingAmount
        )
      ).to.equal(true);
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle1,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // oracle 2 submits
      receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle2,
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle2,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // oracle 3 submits
      receipt = await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle3,
        }
      );
      expectEvent(receipt, 'VoteSubmitted', {
        oracle: oracle3,
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        nonce: new BN(0),
      });

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        totalRewards
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
        from: admin,
      });

      // oracle 1 submits
      await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle1,
        }
      );

      // oracle 2 submits
      await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle2,
        }
      );

      // oracle 3 submits
      await oracles.vote(
        totalRewards,
        activationDuration,
        beaconActivatingAmount,
        {
          from: oracle3,
        }
      );

      // update submitted
      expect(await rewardEthToken.totalRewards()).to.bignumber.equal(
        totalRewards
      );
      expect(await pool.activationDuration()).to.bignumber.equal(
        new BN(initialSettings.activationDuration)
      );
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        new BN(initialSettings.beaconActivatingAmount).add(poolDeposit)
      );
    });
  });
});
