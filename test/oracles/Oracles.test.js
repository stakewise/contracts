const { keccak256, defaultAbiCoder } = require('ethers/lib/utils');
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
  setMerkleRoot,
  setTotalRewards,
  setRewardsVotingPeriod,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');
const MerkleDistributor = artifacts.require('MerkleDistributor');
const OracleMock = artifacts.require('OracleMock');

contract('Oracles', ([_, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles, rewardEthToken, pool, merkleDistributor;
  let [oracle, anotherOracle, anyone] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    merkleDistributor = await MerkleDistributor.at(
      upgradedContracts.merkleDistributor
    );
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
      let newSyncPeriod = new BN('700');
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
      let newSyncPeriod = new BN('700');
      await expectRevert(
        oracles.setSyncPeriod(newSyncPeriod, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
      expect(await oracles.syncPeriod()).bignumber.equal(
        new BN(contractSettings.syncPeriod)
      );
    });

    it('cannot update oracles sync period when voting for rewards', async () => {
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);
      await expectRevert(
        oracles.setSyncPeriod(new BN('900'), {
          from: admin,
        }),
        'Oracles: cannot update during voting'
      );
    });
  });

  describe('rewards voting', () => {
    let prevTotalRewards,
      newTotalRewards,
      currentNonce,
      pendingValidators,
      activatedValidators,
      oracleAccounts,
      candidateId;

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

      let encoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          currentNonce.toString(),
          newTotalRewards.toString(),
          activatedValidators.toString(),
        ]
      );
      candidateId = keccak256(encoded);
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
          {
            from: oracleAccounts[0],
          }
        ),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
          {
            from: anyone,
          }
        ),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);
      await oracles.voteForRewards(
        currentNonce,
        newTotalRewards,
        activatedValidators,
        {
          from: oracleAccounts[0],
        }
      );

      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        true
      );

      await expectRevert(
        oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: already voted'
      );
    });

    it('cannot vote too early', async () => {
      await expectRevert(
        oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: too early vote'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);

      const receipt = await oracles.voteForRewards(
        currentNonce,
        newTotalRewards,
        activatedValidators,
        {
          from: oracleAccounts[0],
        }
      );
      expectEvent(receipt, 'RewardsVoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activatedValidators,
        nonce: currentNonce,
      });
      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        true
      );
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
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);
      let newActivatedValidators = activatedValidators.add(pendingValidators);
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          currentNonce.toString(),
          newTotalRewards.toString(),
          newActivatedValidators.toString(),
        ]
      );
      let candidateId = keccak256(encoded);

      for (let i = 0; i < oracleAccounts.length; i++) {
        let receipt = await oracles.voteForRewards(
          currentNonce,
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
        expect(await oracles.hasVote(oracleAccounts[i], candidateId)).to.equal(
          true
        );
        expectEvent(receipt, 'RewardsVoteSubmitted', {
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

      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);

      // nonce has incremented
      await expectRevert(
        oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: invalid nonce'
      );

      // new vote comes with different nonce
      let receipt = await oracles.voteForRewards(
        currentNonce.add(new BN(1)),
        newTotalRewards,
        newActivatedValidators,
        {
          from: oracleAccounts[0],
        }
      );

      // previous vote cleaned up
      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        false
      );
      encoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          currentNonce.add(new BN(1)).toString(),
          newTotalRewards.toString(),
          newActivatedValidators.toString(),
        ]
      );
      let candidateId2 = keccak256(encoded);

      // new vote comes with an increased vote ID
      expect(await oracles.hasVote(oracleAccounts[0], candidateId2)).to.equal(
        true
      );
      expectEvent(receipt, 'RewardsVoteSubmitted', {
        oracle: oracleAccounts[0],
        totalRewards: newTotalRewards,
        activatedValidators: newActivatedValidators,
        nonce: currentNonce.add(new BN(1)),
      });
    });

    it('does not update activation data when did not change', async () => {
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);
      activatedValidators = new BN(contractSettings.activatedValidators);
      pendingValidators = await pool.pendingValidators();

      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.voteForRewards(
          currentNonce,
          newTotalRewards,
          activatedValidators,
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
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
      expect(await pool.pendingValidators()).to.bignumber.equal(
        pendingValidators
      );
    });
  });

  describe('merkle root voting', () => {
    const merkleRoot =
      '0xa3e724fce28a564a7908e40994bd8f48ed4470ffcab4c135fe661bcf5b15afe6';
    const merkleProofs =
      'ipfs://QmehR8yCaKdHqHSxZMSJA5q2SWc8jTVCSKuVgbtqDEdXCH';
    let currentNonce, oracleAccounts, candidateId;

    beforeEach(async () => {
      oracleAccounts = await getOracleAccounts({ oracles });
      for (const oracleAccount of oracleAccounts) {
        await send.ether(anyone, oracleAccount, ether('2'));
      }
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards: ether('1000'),
      });

      currentNonce = await oracles.currentNonce();
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'string'],
        [currentNonce.toString(), merkleRoot, merkleProofs]
      );
      candidateId = keccak256(encoded);
    });

    it('fails to vote when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.voteForMerkleRoot(currentNonce, merkleRoot, merkleProofs, {
          from: oracleAccounts[0],
        }),
        'Pausable: paused'
      );
    });

    it('only oracle can submit vote', async () => {
      await expectRevert(
        oracles.voteForMerkleRoot(currentNonce, merkleRoot, merkleProofs, {
          from: anyone,
        }),
        'Oracles: access denied'
      );
    });

    it('cannot vote twice', async () => {
      await oracles.voteForMerkleRoot(currentNonce, merkleRoot, merkleProofs, {
        from: oracleAccounts[0],
      });

      let encoded = defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'string'],
        [currentNonce.toString(), merkleRoot, merkleProofs]
      );
      let candidateId = keccak256(encoded);
      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        true
      );

      await expectRevert(
        oracles.voteForMerkleRoot(currentNonce, merkleRoot, merkleProofs, {
          from: oracleAccounts[0],
        }),
        'Oracles: already voted'
      );
    });

    it('fails to vote for total rewards and merkle root in same block', async () => {
      // clean up oracles
      for (let i = 0; i < oracleAccounts.length; i++) {
        await oracles.removeOracle(oracleAccounts[i], {
          from: admin,
        });
      }

      // deploy mocked oracle
      let mockedOracle = await OracleMock.new(
        contracts.oracles,
        contracts.stakedEthToken,
        contracts.rewardEthToken,
        merkleDistributor.address
      );
      await oracles.addOracle(mockedOracle.address, {
        from: admin,
      });

      // wait for rewards voting time
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);

      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      let activatedValidators = await pool.activatedValidators();

      await expectRevert(
        mockedOracle.updateTotalRewardsAndMerkleRoot(
          totalRewards,
          activatedValidators,
          merkleRoot,
          merkleProofs,
          {
            from: anyone,
          }
        ),
        'Oracles: too early vote'
      );
    });

    it('cannot vote too early', async () => {
      await setMerkleRoot({
        merkleDistributor,
        merkleRoot,
        merkleProofs,
        oracles,
        oracleAccounts,
      });

      await expectRevert(
        oracles.voteForMerkleRoot(
          currentNonce.add(new BN(1)),
          merkleRoot,
          merkleProofs,
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: too early vote'
      );
    });

    it('does not submit new data when not enough votes', async () => {
      const receipt = await oracles.voteForMerkleRoot(
        currentNonce,
        merkleRoot,
        merkleProofs,
        {
          from: oracleAccounts[0],
        }
      );

      expectEvent(receipt, 'MerkleRootVoteSubmitted', {
        oracle: oracleAccounts[0],
        merkleRoot,
        merkleProofs,
        nonce: currentNonce,
      });
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'string'],
        [currentNonce.toString(), merkleRoot, merkleProofs]
      );
      let candidateId = keccak256(encoded);
      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        true
      );
      expect(await merkleDistributor.merkleRoot()).to.not.equal(merkleRoot);
    });

    it('submits data when enough votes collected', async () => {
      for (let i = 0; i < oracleAccounts.length; i++) {
        let receipt = await oracles.voteForMerkleRoot(
          currentNonce,
          merkleRoot,
          merkleProofs,
          {
            from: oracleAccounts[i],
          }
        );
        if ((await merkleDistributor.merkleRoot()) === merkleRoot) {
          break;
        }

        expect(await oracles.hasVote(oracleAccounts[i], candidateId)).to.equal(
          true
        );
        expectEvent(receipt, 'MerkleRootVoteSubmitted', {
          oracle: oracleAccounts[i],
          merkleRoot,
          merkleProofs,
          nonce: currentNonce,
        });
      }

      // update submitted
      expect(await merkleDistributor.merkleRoot()).to.equal(merkleRoot);

      // nonce has incremented
      await expectRevert(
        oracles.voteForMerkleRoot(currentNonce, merkleRoot, merkleProofs, {
          from: oracleAccounts[0],
        }),
        'Oracles: invalid nonce'
      );

      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

      // new vote comes with different nonce
      let receipt = await oracles.voteForMerkleRoot(
        currentNonce.add(new BN(2)),
        merkleRoot,
        merkleProofs,
        {
          from: oracleAccounts[0],
        }
      );

      // previous vote cleaned up
      expect(await oracles.hasVote(oracleAccounts[0], candidateId)).to.equal(
        false
      );
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'string'],
        [currentNonce.add(new BN(2)).toString(), merkleRoot, merkleProofs]
      );
      let candidateId2 = keccak256(encoded);

      // new vote comes with an increased vote ID
      expect(await oracles.hasVote(oracleAccounts[0], candidateId2)).to.equal(
        true
      );
      expectEvent(receipt, 'MerkleRootVoteSubmitted', {
        oracle: oracleAccounts[0],
        merkleRoot,
        merkleProofs,
        nonce: currentNonce.add(new BN(2)),
      });
    });
  });
});
