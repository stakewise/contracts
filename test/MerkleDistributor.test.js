const { defaultAbiCoder, hexlify } = require('ethers/lib/utils');
const {
  expectRevert,
  expectEvent,
  ether,
  send,
  BN,
  constants,
} = require('@openzeppelin/test-helpers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { upgradeContracts, upgradeRewardToken } = require('../deployments');
const { contractSettings, contracts } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setupOracleAccounts,
  setTotalRewards,
  setMerkleRoot,
  addStakedToken,
  mintTokens,
} = require('./utils');

const MerkleDistributor = artifacts.require('MerkleDistributor');
const IGCToken = artifacts.require('IGCToken');
const RewardToken = artifacts.require('RewardToken');
const StakedToken = artifacts.require('StakedToken');
const MulticallMock = artifacts.require('MulticallMock');
const Oracles = artifacts.require('Oracles');

const account1 = '0x7981973BF488Ea610AF41dDB9DFeF1f8095ECF56';
const account2 = '0xB3a69b7cdd7510D51c4CCc2c0fC105021A92Fc5D';
const account3 = '0xd1b91Ac5eb55f30D742751f4Ae4437F738eB8F6b';

const distributorGNOReward = ether('25.1777');
const distributorTokenReward = ether('14.86062535');

contract('Merkle Distributor', ([beneficiary, anyone, vault, ...accounts]) => {
  const admin = contractSettings.admin;
  let merkleDistributor,
    amount,
    durationInBlocks,
    token,
    rewardToken,
    stakedToken,
    oracles,
    oracleAccounts,
    prevDistributorBalance,
    merkleRoot,
    merkleProofs;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts(vault);
    amount = ether('10');
    durationInBlocks = new BN(1000);
    token = await IGCToken.at(contracts.stakeWiseToken);

    rewardToken = await RewardToken.at(upgradedContracts.rewardToken);
    stakedToken = await StakedToken.at(upgradedContracts.stakedToken);
    merkleDistributor = await MerkleDistributor.at(
      upgradedContracts.merkleDistributor
    );
    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts,
    });
    prevDistributorBalance = await token.balanceOf(merkleDistributor.address);
    merkleProofs = {
      [account1]: {
        index: '0',
        amounts: ['12177700000000000000', '987000000000000000'],
        tokens: [upgradedContracts.rewardToken, contracts.stakeWiseToken],
      },
      [account2]: {
        index: '1',
        amounts: ['3000000000000000000', '12312312000000000000'],
        tokens: [upgradedContracts.rewardToken, contracts.stakeWiseToken],
      },
      [account3]: {
        index: '2',
        amounts: ['10000000000000000000', '1561313350000000000'],
        tokens: [upgradedContracts.rewardToken, contracts.stakeWiseToken],
      },
    };

    const leaves = [];
    for (const [account, el] of Object.entries(merkleProofs)) {
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'address[]', 'address', 'uint256[]'],
        [el.index, el.tokens, account, el.amounts]
      );
      leaves.push(keccak256(encoded));
    }
    const tree = new MerkleTree(leaves, keccak256, { sort: true });
    merkleRoot = '0x' + tree.getRoot().toString('hex');
    for (const [account, el] of Object.entries(merkleProofs)) {
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'address[]', 'address', 'uint256[]'],
        [el.index, el.tokens, account, el.amounts]
      );
      merkleProofs[account].proof = tree.getHexProof(keccak256(encoded));
    }

    await addStakedToken(stakedToken, anyone, ether('1'));
    await send.ether(anyone, admin, ether('3000'));
    await mintTokens(token, admin, amount);
  });

  afterEach(async () => resetFork());

  it('not oracle fails to update merkle root', async () => {
    await expectRevert(
      merkleDistributor.setMerkleRoot(merkleRoot, 'link to merkle proofs', {
        from: admin,
      }),
      'MerkleDistributor: access denied'
    );
  });

  describe('periodically distribute', () => {
    it('not admin fails to distribute tokens', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          amount,
          durationInBlocks,
          {
            from: anyone,
          }
        ),
        'OwnablePausable: access denied'
      );
    });

    it('fails to distribute tokens with zero amount', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          new BN(0),
          durationInBlocks,
          {
            from: admin,
          }
        ),
        'MerkleDistributor: invalid amount'
      );
    });

    it('fails to distribute tokens from zero address', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          constants.ZERO_ADDRESS,
          token.address,
          beneficiary,
          amount,
          durationInBlocks,
          {
            from: admin,
          }
        ),
        'SafeERC20: low-level call failed'
      );
    });

    it('fails to distribute tokens with max uint duration', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          amount,
          constants.MAX_UINT256,
          {
            from: admin,
          }
        ),
        'MerkleDistributor: invalid blocks duration'
      );
    });

    it('fails to distribute tokens with zero duration', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          amount,
          new BN(0),
          {
            from: admin,
          }
        ),
        'MerkleDistributor: invalid blocks duration'
      );
    });

    it('fails to distribute tokens without allowance', async () => {
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          amount,
          durationInBlocks,
          {
            from: admin,
          }
        ),
        'SafeERC20: low-level call failed'
      );
    });

    it('fails to distribute when paused', async () => {
      await merkleDistributor.pause({ from: admin });
      await expectRevert(
        merkleDistributor.distributePeriodically(
          admin,
          token.address,
          beneficiary,
          amount,
          durationInBlocks,
          {
            from: admin,
          }
        ),
        'Pausable: paused'
      );
    });

    it('admin can distribute tokens', async () => {
      await token.approve(merkleDistributor.address, amount, {
        from: admin,
      });

      let receipt = await merkleDistributor.distributePeriodically(
        admin,
        token.address,
        beneficiary,
        amount,
        durationInBlocks,
        {
          from: admin,
        }
      );

      let startBlock = new BN(receipt.receipt.blockNumber);
      await expectEvent(receipt, 'PeriodicDistributionAdded', {
        from: admin,
        token: token.address,
        beneficiary,
        amount,
        startBlock: startBlock,
        endBlock: startBlock.add(durationInBlocks),
      });
      expect(
        await token.balanceOf(merkleDistributor.address)
      ).to.bignumber.equal(prevDistributorBalance.add(amount));
    });
  });

  describe('one time distribute', () => {
    const origin = '0x1111111111111111111111111111111111111111';
    const rewardsLink = 'ipfs://QmehR8yCaKdHqHSxZMSJA5q2SWc8jTVCSKuVgbtqDEdXCH';

    it('not admin fails to distribute tokens', async () => {
      await expectRevert(
        merkleDistributor.distributeOneTime(
          admin,
          origin,
          token.address,
          amount,
          rewardsLink,
          {
            from: anyone,
          }
        ),
        'OwnablePausable: access denied'
      );
    });

    it('fails to distribute tokens with zero amount', async () => {
      await expectRevert(
        merkleDistributor.distributeOneTime(
          admin,
          origin,
          token.address,
          new BN(0),
          rewardsLink,
          {
            from: admin,
          }
        ),
        'MerkleDistributor: invalid amount'
      );
    });

    it('fails to distribute tokens from zero address', async () => {
      await expectRevert(
        merkleDistributor.distributeOneTime(
          constants.ZERO_ADDRESS,
          origin,
          token.address,
          amount,
          rewardsLink,
          {
            from: admin,
          }
        ),
        'SafeERC20: low-level call failed'
      );
    });

    it('fails to distribute tokens without allowance', async () => {
      await expectRevert(
        merkleDistributor.distributeOneTime(
          admin,
          origin,
          token.address,
          amount,
          rewardsLink,
          {
            from: admin,
          }
        ),
        'SafeERC20: low-level call failed'
      );
    });

    it('fails to distribute when paused', async () => {
      await merkleDistributor.pause({ from: admin });
      await expectRevert(
        merkleDistributor.distributeOneTime(
          admin,
          origin,
          token.address,
          amount,
          rewardsLink,
          {
            from: admin,
          }
        ),
        'Pausable: paused'
      );
    });

    it('admin can distribute tokens', async () => {
      await token.approve(merkleDistributor.address, amount, {
        from: admin,
      });

      let receipt = await merkleDistributor.distributeOneTime(
        admin,
        origin,
        token.address,
        amount,
        rewardsLink,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OneTimeDistributionAdded', {
        from: admin,
        origin,
        token: token.address,
        amount,
        rewardsLink,
      });
      expect(
        await token.balanceOf(merkleDistributor.address)
      ).to.bignumber.equal(prevDistributorBalance.add(amount));
    });
  });

  describe('claim', () => {
    beforeEach(async () => {
      // new rewards arrive
      let totalRewards = (await rewardToken.totalRewards()).add(ether('10'));

      await mintTokens(token, admin, amount);
      await addStakedToken(stakedToken, anyone, ether('1'));
      await setTotalRewards({
        rewardToken,
        totalRewards,
        vault,
      });
    });

    it('cannot claim when contract paused', async () => {
      const { index, proof, amounts, tokens } = merkleProofs[account1];
      await merkleDistributor.pause({ from: admin });
      await expectRevert(
        merkleDistributor.claim(index, account1, tokens, amounts, proof, {
          from: anyone,
        }),
        'Pausable: paused'
      );
    });

    it('cannot claim when merkle root updating', async () => {
      // try to claim before merkle root update
      const { index, proof, amounts, tokens } = merkleProofs[account1];
      await expectRevert(
        merkleDistributor.claim(index, account1, tokens, amounts, proof, {
          from: anyone,
        }),
        'MerkleDistributor: merkle root updating'
      );
    });

    it('cannot claim with invalid merkle proof', async () => {
      await setMerkleRoot({
        merkleDistributor,
        merkleRoot,
        merkleProofs,
        oracles,
        oracleAccounts,
      });
      const { index, amounts, tokens } = merkleProofs[account1];
      await expectRevert(
        merkleDistributor.claim(
          index,
          account1,
          tokens,
          amounts,
          merkleProofs[account2].proof,
          {
            from: anyone,
          }
        ),
        'MerkleDistributor: invalid proof'
      );
    });

    it('cannot claim twice', async () => {
      await addStakedToken(stakedToken, anyone, ether('100'));
      await stakedToken.toggleRewards(anyone, true, {
        from: admin,
      });
      let totalDeposits = await stakedToken.totalDeposits();
      let totalRewards = await rewardToken.totalSupply();
      let periodReward = distributorGNOReward
        .mul(totalDeposits)
        .div(ether('1000'));
      let protocolFee = await rewardToken.protocolFee();
      totalRewards = totalRewards.add(periodReward);
      totalRewards = totalRewards.add(
        periodReward.mul(protocolFee).div(new BN(10000))
      );

      await setTotalRewards({
        rewardToken,
        totalRewards,
        vault,
      });

      await token.transfer(merkleDistributor.address, distributorTokenReward, {
        from: admin,
      });
      await setMerkleRoot({
        merkleDistributor,
        merkleRoot,
        merkleProofs,
        oracles,
        oracleAccounts,
      });

      const { index, amounts, tokens, proof } = merkleProofs[account1];
      await merkleDistributor.claim(index, account1, tokens, amounts, proof, {
        from: anyone,
      });

      await expectRevert(
        merkleDistributor.claim(index, account1, tokens, amounts, proof, {
          from: anyone,
        }),
        'MerkleDistributor: already claimed'
      );
    });

    it('can claim reward tokens', async () => {
      await addStakedToken(stakedToken, anyone, ether('1000'));
      await stakedToken.toggleRewards(anyone, true, {
        from: admin,
      });
      await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: ether('100000'),
      });

      await token.transfer(merkleDistributor.address, distributorTokenReward, {
        from: admin,
      });
      await setMerkleRoot({
        merkleDistributor,
        merkleRoot,
        merkleProofs,
        oracles,
        oracleAccounts,
      });
      let distributorGNORewards = await rewardToken.balanceOf(
        constants.ZERO_ADDRESS
      );
      expect(distributorGNORewards).to.bignumber.greaterThan(new BN(0));

      let totalTransferredGnoReward = new BN(0);
      for (const [account, { index, proof, tokens, amounts }] of Object.entries(
        merkleProofs
      )) {
        let balance1 = await rewardToken.balanceOf(account);
        let balance2 = await token.balanceOf(account);

        const receipt = await merkleDistributor.claim(
          index,
          account,
          tokens,
          amounts,
          proof,
          {
            from: anyone,
          }
        );
        expectEvent(receipt, 'Claimed', {
          account,
          index,
          tokens,
        });
        await expectEvent.inTransaction(receipt.tx, RewardToken, 'Transfer', {
          from: constants.ZERO_ADDRESS,
          to: account,
          value: new BN(amounts[0]),
        });
        expect(await merkleDistributor.isClaimed(index)).to.be.equal(true);
        expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(
          balance1.add(new BN(amounts[0]))
        );
        totalTransferredGnoReward = totalTransferredGnoReward.add(
          new BN(amounts[0])
        );
        expect(
          await rewardToken.balanceOf(constants.ZERO_ADDRESS)
        ).to.bignumber.equal(
          distributorGNORewards.sub(totalTransferredGnoReward)
        );
        expect(await token.balanceOf(account)).to.be.bignumber.equal(
          balance2.add(new BN(amounts[1]))
        );
      }
    });

    describe('claiming within the same block', () => {
      const rewardsDelta = ether('10');
      let multicallMock, totalRewards, merkleRootSignatures;

      beforeEach(async () => {
        await setMerkleRoot({
          merkleDistributor,
          merkleRoot,
          merkleProofs,
          oracles,
          oracleAccounts,
        });

        // deploy mocked oracle
        multicallMock = await MulticallMock.new(
          oracles.address,
          stakedToken.address,
          rewardToken.address,
          merkleDistributor.address
        );
        await oracles.addOracle(multicallMock.address, {
          from: admin,
        });

        await addStakedToken(stakedToken, anyone, ether('1000'));
        await stakedToken.toggleRewards(anyone, true, {
          from: admin,
        });
        let totalDeposits = await stakedToken.totalDeposits();
        let protocolFee = await rewardToken.protocolFee();
        totalRewards = distributorGNOReward
          .mul(totalDeposits)
          .div(ether('1000'));
        totalRewards = totalRewards.add(
          totalRewards.add(protocolFee.div(new BN(10000)))
        );

        // create merkle root signature
        let currentNonce = await oracles.currentRewardsNonce();
        let encoded = defaultAbiCoder.encode(
          ['uint256', 'string', 'bytes32'],
          [currentNonce.toString(), merkleProofs, merkleRoot]
        );

        let candidateId = hexlify(keccak256(encoded));
        merkleRootSignatures = [];
        for (const oracleAccount of oracleAccounts) {
          merkleRootSignatures.push(
            await web3.eth.sign(candidateId, oracleAccount)
          );
        }
      });

      it('cannot claim after total rewards update in the same block', async () => {
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        const signer = await ethers.provider.getSigner(contractSettings.admin);
        await upgradeRewardToken(signer, multicallMock.address);
        await expectRevert(
          multicallMock.updateTotalRewardsAndClaim(
            rewardsDelta,
            index,
            account1,
            tokens,
            amounts,
            proof,
            {
              from: anyone,
            }
          ),
          'MerkleDistributor: merkle root updating'
        );
      });

      it('cannot claim before merkle root update in the same block', async () => {
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        const signer = await ethers.provider.getSigner(contractSettings.admin);
        await upgradeRewardToken(signer, vault);
        await rewardToken.updateTotalRewards(rewardsDelta, {
          from: vault,
        });
        await expectRevert(
          multicallMock.claimAndUpdateMerkleRoot(
            { merkleRoot, merkleProofs, signatures: merkleRootSignatures },
            index,
            account1,
            tokens,
            amounts,
            proof,
            {
              from: anyone,
            }
          ),
          'MerkleDistributor: merkle root updating'
        );
      });
    });
  });
});
