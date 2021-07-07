const {
  expectRevert,
  expectEvent,
  ether,
  send,
  BN,
  constants,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../deployments');
const { contractSettings, contracts } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  getOracleAccounts,
  setTotalRewards,
  setMerkleRoot,
  setRewardsVotingPeriod,
} = require('./utils');

const MerkleDistributor = artifacts.require('MerkleDistributor');
const StakeWiseToken = artifacts.require('StakeWiseToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const StakedEthToken = artifacts.require('StakedEthToken');
const OracleMock = artifacts.require('OracleMock');
const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

const merkleRoot =
  '0x2bc0af1cc003ab3e7b31092dfa275dd93356d0ff24829926da54ba54cfca71b5';
const account1 = '0x7981973BF488Ea610AF41dDB9DFeF1f8095ECF56';
const account2 = '0xB3a69b7cdd7510D51c4CCc2c0fC105021A92Fc5D';
const account3 = '0xd1b91Ac5eb55f30D742751f4Ae4437F738eB8F6b';

const distributorEthReward = ether('25.1777');
const distributorTokenReward = ether('14.86062535');
const merkleProofs = {
  [account1]: {
    index: '0',
    amounts: ['12177700000000000000', '987000000000000000'],
    tokens: [contracts.rewardEthToken, contracts.stakeWiseToken],
    proof: [
      '0x6459080d2a203338fd3f49809e85985c5ade49f1b98a007373abb8267bc6920c',
      '0x95bc581b9fcfea7831e010e615c7e519868a75bff5de541be47e2d29d6608d69',
    ],
  },
  [account2]: {
    index: '1',
    amounts: ['3000000000000000000', '12312312000000000000'],
    tokens: [contracts.rewardEthToken, contracts.stakeWiseToken],
    proof: [
      '0x11383f5cf0bc5f9a2bf86e40f2205e4e5a78aaec00eb068e8e48162dabf72d5b',
    ],
  },
  [account3]: {
    index: '2',
    amounts: ['10000000000000000000', '1561313350000000000'],
    tokens: [contracts.rewardEthToken, contracts.stakeWiseToken],
    proof: [
      '0x77dcc78b86eef2e4ff7fdace198260bd0bc405f03d78ca9dc920f255f270d316',
      '0x95bc581b9fcfea7831e010e615c7e519868a75bff5de541be47e2d29d6608d69',
    ],
  },
};

contract('Merkle Distributor', ([beneficiary, anyone]) => {
  const admin = contractSettings.admin;
  let merkleDistributor,
    amount,
    durationInBlocks,
    token,
    rewardEthToken,
    stakedEthToken,
    oracles,
    oracleAccounts,
    pool;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    amount = ether('10');
    durationInBlocks = new BN(1000);
    token = await StakeWiseToken.at(contracts.stakeWiseToken);
    merkleDistributor = await MerkleDistributor.at(
      upgradedContracts.merkleDistributor
    );

    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    merkleDistributor = await MerkleDistributor.at(
      upgradedContracts.merkleDistributor
    );
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    pool = await Pool.at(contracts.pool);
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

  describe('distribute', () => {
    it('not admin fails to distribute tokens', async () => {
      await expectRevert(
        merkleDistributor.distribute(
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
        merkleDistributor.distribute(
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

    it('fails to distribute tokens with max uint duration', async () => {
      await expectRevert(
        merkleDistributor.distribute(
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
        merkleDistributor.distribute(
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
        merkleDistributor.distribute(
          token.address,
          beneficiary,
          amount,
          durationInBlocks,
          {
            from: admin,
          }
        ),
        'SafeMath: subtraction overflow'
      );
    });

    it('admin can distribute tokens', async () => {
      await token.approve(merkleDistributor.address, amount, {
        from: admin,
      });
      let prevAmount = await token.balanceOf(merkleDistributor.address);

      let receipt = await merkleDistributor.distribute(
        token.address,
        beneficiary,
        amount,
        durationInBlocks,
        {
          from: admin,
        }
      );

      let startBlock = new BN(receipt.receipt.blockNumber);
      await expectEvent(receipt, 'DistributionAdded', {
        sender: admin,
        token: token.address,
        beneficiary,
        amount,
        startBlock: startBlock,
        endBlock: startBlock.add(durationInBlocks),
      });
      expect(
        await token.balanceOf(merkleDistributor.address)
      ).to.bignumber.equal(prevAmount.add(amount));
    });
  });

  describe('claim', () => {
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
      // new rewards arrive
      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });

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
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards: ether('100000'),
      });
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
      await pool.setMinActivatingDeposit(constants.MAX_UINT256, {
        from: admin,
      });
      await pool.addDeposit({
        from: anyone,
        value: ether('1000'),
      });
      await stakedEthToken.toggleRewards(anyone, true, {
        from: admin,
      });
      let totalDeposits = await stakedEthToken.totalDeposits();
      let totalRewards = await rewardEthToken.totalSupply();
      let periodReward = distributorEthReward
        .mul(totalDeposits)
        .div(ether('1000'));
      let maintainerFee = await rewardEthToken.maintainerFee();
      totalRewards = totalRewards.add(periodReward);
      totalRewards = totalRewards.add(
        periodReward.mul(maintainerFee).div(new BN(10000))
      );

      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
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
      await pool.setMinActivatingDeposit(constants.MAX_UINT256, {
        from: admin,
      });
      await pool.addDeposit({
        from: anyone,
        value: ether('1000'),
      });
      await stakedEthToken.toggleRewards(anyone, true, {
        from: admin,
      });
      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
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
      let distributorEthRewards = await rewardEthToken.balanceOf(
        constants.ZERO_ADDRESS
      );
      expect(distributorEthRewards).to.bignumber.greaterThan(new BN(0));

      let totalTransferredEthReward = new BN(0);
      for (const [account, { index, proof, tokens, amounts }] of Object.entries(
        merkleProofs
      )) {
        let balance1 = await rewardEthToken.balanceOf(account);
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
        await expectEvent.inTransaction(
          receipt.tx,
          RewardEthToken,
          'Transfer',
          {
            from: constants.ZERO_ADDRESS,
            to: account,
            value: new BN(amounts[0]),
          }
        );
        expect(await merkleDistributor.isClaimed(index)).to.be.equal(true);
        expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
          balance1.add(new BN(amounts[0]))
        );
        totalTransferredEthReward = totalTransferredEthReward.add(
          new BN(amounts[0])
        );
        expect(
          await rewardEthToken.balanceOf(constants.ZERO_ADDRESS)
        ).to.bignumber.equal(
          distributorEthRewards.sub(totalTransferredEthReward)
        );
        expect(await token.balanceOf(account)).to.be.bignumber.equal(
          balance2.add(new BN(amounts[1]))
        );
      }
    });

    describe('claiming within the same block', () => {
      let mockedOracle, totalRewards, activatedValidators;
      beforeEach(async () => {
        await setTotalRewards({
          admin,
          rewardEthToken,
          oracles,
          oracleAccounts,
          pool,
          totalRewards: (await rewardEthToken.totalRewards()).add(new BN(1)),
        });

        await setMerkleRoot({
          merkleDistributor,
          merkleRoot,
          merkleProofs,
          oracles,
          oracleAccounts,
        });

        // clean up oracles
        for (let i = 0; i < oracleAccounts.length; i++) {
          await oracles.removeOracle(oracleAccounts[i], {
            from: admin,
          });
        }

        // deploy mocked oracle
        mockedOracle = await OracleMock.new(
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

        await pool.addDeposit({
          from: anyone,
          value: ether('1000'),
        });
        await stakedEthToken.toggleRewards(anyone, true, {
          from: admin,
        });
        let totalDeposits = await stakedEthToken.totalDeposits();
        let maintainerFee = await rewardEthToken.maintainerFee();
        totalRewards = distributorEthReward
          .mul(totalDeposits)
          .div(ether('1000'));
        totalRewards = totalRewards.add(
          totalRewards.add(maintainerFee.div(new BN(10000)))
        );
        activatedValidators = await pool.activatedValidators();
      });

      it('cannot claim after total rewards update in the same block', async () => {
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        await expectRevert(
          mockedOracle.updateTotalRewardsAndClaim(
            totalRewards,
            activatedValidators,
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

      it('can claim before total rewards update in the same block', async () => {
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        await expectRevert(
          mockedOracle.claimAndUpdateTotalRewards(
            totalRewards,
            activatedValidators,
            index,
            account1,
            tokens,
            amounts,
            proof,
            {
              from: anyone,
            }
          ),
          'SafeMath: subtraction overflow'
        );
      });

      it('cannot claim before merkle root update in the same block', async () => {
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        await mockedOracle.updateTotalRewards(
          totalRewards,
          activatedValidators
        );
        await expectRevert(
          mockedOracle.claimAndUpdateMerkleRoot(
            merkleRoot,
            merkleProofs,
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

      it('can claim after merkle root update in the same block', async () => {
        await mockedOracle.updateTotalRewards(
          totalRewards,
          activatedValidators
        );
        const { index, amounts, tokens, proof } = merkleProofs[account1];
        await mockedOracle.updateMerkleRootAndClaim(
          merkleRoot,
          merkleProofs,
          index,
          account1,
          tokens,
          amounts,
          proof,
          {
            from: anyone,
          }
        );
      });
    });
  });
});
