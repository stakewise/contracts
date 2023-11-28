const { keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  ether,
  send,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setupOracleAccounts,
  setTotalRewards,
} = require('../utils');
const { contractSettings } = require('../../deployments/settings');
const {
  upgradeContracts,
  upgradeRewardEthToken,
} = require('../../deployments');
const { ethers } = require('hardhat');

const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');
const MerkleDistributor = artifacts.require('MerkleDistributor');

contract('Oracles', ([_, anyone, ...accounts]) => {
  let admin = contractSettings.admin;
  let oracles, rewardEthToken, merkleDistributor, contracts;
  let [oracle, anotherOracle, vault] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    contracts = await upgradeContracts(vault);
    oracles = await Oracles.at(contracts.oracles);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    merkleDistributor = await MerkleDistributor.at(contracts.merkleDistributor);
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
      expectEvent(receipt, 'OracleAdded', {
        oracle,
      });
      expect(await oracles.isOracle(oracle)).equal(true);
      expect(await oracles.isOracle(admin)).equal(false);
      expect(await oracles.isOracle(anyone)).equal(false);
    });

    it('others cannot assign oracle role to an account', async () => {
      await expectRevert(
        oracles.addOracle(oracle, {
          from: anyone,
        }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await oracles.isOracle(oracle)).equal(false);
      expect(await oracles.isOracle(anyone)).equal(false);
    });

    it('oracles cannot assign oracle role to others', async () => {
      await oracles.addOracle(oracle, {
        from: admin,
      });
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
      await oracles.addOracle(oracle, {
        from: admin,
      });
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

  describe('merkle root voting', () => {
    const merkleRoot =
      '0xa3e724fce28a564a7908e40994bd8f48ed4470ffcab4c135fe661bcf5b15afe6';
    const merkleProofs =
      'ipfs://QmehR8yCaKdHqHSxZMSJA5q2SWc8jTVCSKuVgbtqDEdXCH';
    let currentNonce, oracleAccounts, candidateId, signatures;

    beforeEach(async () => {
      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      oracleAccounts = await setupOracleAccounts({ oracles, accounts, admin });
      await setTotalRewards({
        vault,
        rewardEthToken,
        totalRewards,
      });

      currentNonce = await oracles.currentRewardsNonce();

      let encoded = defaultAbiCoder.encode(
        ['uint256', 'string', 'bytes32'],
        [
          currentNonce.toString(),
          merkleProofs.toString(),
          merkleRoot.toString(),
        ]
      );
      candidateId = keccak256(encoded);

      signatures = [];
      for (const oracleAccount of oracleAccounts) {
        signatures.push(await web3.eth.sign(candidateId, oracleAccount));
      }
    });

    it('fails to submit when contract is paused', async () => {
      await oracles.pause({ from: admin });
      expect(await oracles.paused()).equal(true);

      await expectRevert(
        oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
          from: oracleAccounts[0],
        }),
        'Pausable: paused'
      );
    });

    it('fails to submit too early', async () => {
      await oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
        from: oracleAccounts[0],
      });

      await expectRevert(
        oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
          from: oracleAccounts[0],
        }),
        'Oracles: too early'
      );
    });

    it('fails to submit with not enough signatures', async () => {
      await expectRevert(
        oracles.submitMerkleRoot(
          merkleRoot,
          merkleProofs,
          signatures.slice(signatures.length - 1),
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: invalid number of signatures'
      );
    });

    it('fails to submit with invalid signature', async () => {
      signatures[0] = await web3.eth.sign(candidateId, anyone);
      await expectRevert(
        oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
          from: oracleAccounts[0],
        }),
        'Oracles: invalid signer'
      );
    });

    it('fails to submit with repeated signature', async () => {
      let signature = signatures[0];
      await expectRevert(
        oracles.submitMerkleRoot(
          merkleRoot,
          merkleProofs,
          Array(oracleAccounts.length).fill(signature),
          {
            from: oracleAccounts[0],
          }
        ),
        'Oracles: repeated signature'
      );
    });

    it('fails to submit without oracle role assigned', async () => {
      await expectRevert(
        oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
          from: anyone,
        }),
        'Oracles: access denied'
      );
    });

    it('submits data with enough signatures', async () => {
      let receipt = await oracles.submitMerkleRoot(
        merkleRoot,
        merkleProofs,
        signatures,
        {
          from: oracleAccounts[0],
        }
      );

      // check signatures
      for (const oracleAccount of oracleAccounts) {
        expectEvent(receipt, 'MerkleRootVoteSubmitted', {
          oracle: oracleAccount,
          merkleRoot,
          merkleProofs,
          nonce: currentNonce,
        });
      }

      // check values updates
      expect(await merkleDistributor.merkleRoot()).equal(merkleRoot);
    });

    it('fails to vote for total rewards and merkle root in same block', async () => {
      // deploy mocked oracle
      let multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedEthToken,
        contracts.rewardEthToken,
        merkleDistributor.address
      );
      await oracles.addOracle(multicallMock.address, {
        from: admin,
      });
      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);
      const rewardsDelta = ether('10');

      // create merkle root signatures
      currentNonce = await oracles.currentRewardsNonce();
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'string', 'bytes32'],
        [currentNonce.toString(), merkleProofs, merkleRoot]
      );
      candidateId = keccak256(encoded);
      let merkleRootSignatures = [];
      for (const oracleAccount of oracleAccounts) {
        merkleRootSignatures.push(
          await web3.eth.sign(candidateId, oracleAccount)
        );
      }

      await expectRevert(
        multicallMock.updateTotalRewardsAndMerkleRoot(
          rewardsDelta,
          {
            merkleRoot,
            merkleProofs,
            signatures: merkleRootSignatures,
          },
          {
            from: anyone,
          }
        ),
        'Oracles: too early'
      );
    });
  });
});
