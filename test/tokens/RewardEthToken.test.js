const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
  balance,
} = require('@openzeppelin/test-helpers');
const {
  upgradeContracts,
  upgradeRewardEthToken,
} = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkRewardEthToken,
  setTotalRewards,
  addStakedEthToken,
  addRewardEthToken,
  checkStakedEthToken,
} = require('../utils');
const { ethers } = require('hardhat');

const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');
const VaultMock = artifacts.require('VaultMock');
const protocolFee = new BN(1000);

contract('RewardEthToken', ([sender, merkleDistributor, vault, ...others]) => {
  const admin = contractSettings.admin;
  let stakedEthToken, rewardEthToken, totalSupply, oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));

    let contracts = await upgradeContracts(vault);

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);

    oracles = await Oracles.at(contracts.oracles);
    totalSupply = await rewardEthToken.totalSupply();
    await rewardEthToken.setProtocolFee(protocolFee, { from: admin });
  });

  afterEach(async () => resetFork());

  describe('restricted actions', () => {
    it('not admin fails to update protocol fee recipient address', async () => {
      await expectRevert(
        rewardEthToken.setProtocolFeeRecipient(sender, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('can set zero address for the protocol fee recipient', async () => {
      let receipt = await rewardEthToken.setProtocolFeeRecipient(
        constants.ZERO_ADDRESS,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'ProtocolFeeRecipientUpdated', {
        recipient: constants.ZERO_ADDRESS,
      });
    });

    it('admin can update protocol fee recipient address', async () => {
      let receipt = await rewardEthToken.setProtocolFeeRecipient(sender, {
        from: admin,
      });

      await expectEvent(receipt, 'ProtocolFeeRecipientUpdated', {
        recipient: sender,
      });
    });

    it('not admin fails to update protocol fee', async () => {
      await expectRevert(
        rewardEthToken.setProtocolFee(9999, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update protocol fee', async () => {
      let receipt = await rewardEthToken.setProtocolFee(9999, {
        from: admin,
      });

      await expectEvent(receipt, 'ProtocolFeeUpdated', {
        protocolFee: '9999',
      });
    });

    it('fails to set invalid protocol fee', async () => {
      await expectRevert(
        rewardEthToken.setProtocolFee(10000, {
          from: admin,
        }),
        'RewardEthToken: invalid protocol fee'
      );
    });

    it('only StakedEthToken contract can disable rewards', async () => {
      await expectRevert(
        rewardEthToken.setRewardsDisabled(sender, true, {
          from: admin,
        }),
        'RewardEthToken: access denied'
      );
    });
  });

  describe('updateTotalRewards', () => {
    it('anyone cannot update rewards', async () => {
      await expectRevert(
        rewardEthToken.updateTotalRewards(ether('10'), {
          from: sender,
        }),
        'RewardEthToken: access denied'
      );
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender,
        balance: new BN(0),
      });
    });

    it('vault can update rewards', async () => {
      let prevTotalRewards = await rewardEthToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(ether('10'));
      let receipt = await setTotalRewards({
        rewardEthToken,
        vault,
        totalRewards: newTotalRewards,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsUpdated',
        {
          periodRewards: newTotalRewards.sub(prevTotalRewards),
          totalRewards: newTotalRewards,
        }
      );
    });

    it('assigns protocol fee to distributor', async () => {
      await rewardEthToken.setProtocolFeeRecipient(constants.ZERO_ADDRESS, {
        from: admin,
      });

      let periodReward = ether('10');
      let prevTotalRewards = await rewardEthToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(periodReward);
      let receipt = await setTotalRewards({
        rewardEthToken,
        vault,
        totalRewards: newTotalRewards,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsUpdated',
        {
          periodRewards: periodReward,
          totalRewards: newTotalRewards,
          protocolReward: periodReward
            .mul(await rewardEthToken.protocolFee())
            .div(new BN(10000)),
        }
      );
    });

    it('accumulates penalty', async () => {
      let penalty = ether('10');
      let totalRewards = await rewardEthToken.totalRewards();
      let totalPenalty = await rewardEthToken.totalPenalty();

      let receipt = await setTotalRewards({
        rewardEthToken,
        vault,
        totalRewards: totalRewards.sub(penalty),
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsUpdated',
        {
          periodRewards: '0',
          totalRewards: totalRewards,
          protocolReward: '0',
        }
      );
      totalPenalty = totalPenalty.add(ether('10'));
      expect(await rewardEthToken.totalPenalty()).to.bignumber.equal(
        totalPenalty
      );

      // reduces penalty partially
      let periodReward = ether('5');
      totalPenalty = totalPenalty.sub(periodReward);
      receipt = await setTotalRewards({
        rewardEthToken,
        vault,
        totalRewards: totalRewards.add(periodReward),
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsUpdated',
        {
          periodRewards: '0',
          totalRewards: totalRewards,
          protocolReward: '0',
        }
      );
      expect(await rewardEthToken.totalPenalty()).to.bignumber.equal(
        totalPenalty
      );

      // reduces penalty completely
      periodReward = ether('1');
      receipt = await setTotalRewards({
        rewardEthToken,
        vault,
        totalRewards: totalRewards.add(periodReward).add(totalPenalty),
      });
      totalPenalty = new BN(0);
      totalRewards = totalRewards.add(periodReward);
      await expectEvent.inTransaction(
        receipt.tx,
        RewardEthToken,
        'RewardsUpdated',
        {
          periodRewards: periodReward,
          totalRewards: totalRewards,
          protocolReward: periodReward
            .mul(await rewardEthToken.protocolFee())
            .div(new BN(10000)),
        }
      );
      expect(await rewardEthToken.totalPenalty()).to.bignumber.equal(
        totalPenalty
      );
    });

    it('penalty cannot exceed total assets', async () => {
      let totalAssets = await rewardEthToken.totalAssets();

      await expectRevert(
        rewardEthToken.updateTotalRewards(totalAssets.add(new BN(1)).neg(), {
          from: vault,
        }),
        'RewardEthToken: invalid penalty amount'
      );
    });
  });

  describe('transfer', () => {
    const stakedAmount1 = ether('4');
    const stakedAmount2 = ether('5');
    const [sender1, sender2] = others;
    let rewardAmount1, rewardAmount2;

    beforeEach(async () => {
      await addStakedEthToken(stakedEthToken, sender1, stakedAmount1);
      await addStakedEthToken(stakedEthToken, sender2, stakedAmount2);

      totalSupply = (await rewardEthToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards: totalSupply,
        rewardEthToken,
        vault,
      });

      rewardAmount1 = await rewardEthToken.balanceOf(sender1);
      rewardAmount2 = await rewardEthToken.balanceOf(sender2);
      expect(rewardAmount2.gt(rewardAmount1)).to.equal(true);
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        rewardEthToken.transfer(constants.ZERO_ADDRESS, stakedAmount1, {
          from: sender1,
        }),
        'RewardEthToken: invalid receiver'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        rewardEthToken.transferFrom(
          constants.ZERO_ADDRESS,
          sender2,
          rewardAmount1,
          {
            from: sender1,
          }
        ),
        'RewardEthToken: invalid sender'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('can transfer zero amount', async () => {
      let receipt = await stakedEthToken.transfer(sender2, ether('0'), {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: ether('0'),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await rewardEthToken.pause({ from: admin });
      expect(await rewardEthToken.paused()).equal(true);

      await expectRevert(
        rewardEthToken.transfer(sender2, rewardAmount1, {
          from: sender1,
        }),
        'Pausable: paused'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
      await rewardEthToken.unpause({ from: admin });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        rewardEthToken.transfer(sender2, stakedAmount1.add(ether('1')), {
          from: sender1,
        }),
        'SafeMath: subtraction overflow'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('can transfer rETH2 tokens to different account', async () => {
      let receipt = await rewardEthToken.transfer(sender2, rewardAmount1, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: rewardAmount1,
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply,
        account: sender2,
        balance: rewardAmount1.add(rewardAmount2),
      });
    });

    it('cannot transfer rewards after total rewards update in the same block', async () => {
      // deploy mocked oracle
      let multicallMock = await MulticallMock.new(
        oracles.address,
        stakedEthToken.address,
        rewardEthToken.address,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);

      await rewardEthToken.approve(multicallMock.address, rewardAmount1, {
        from: sender1,
      });

      const rewardsDelta = ether('10');
      await expectRevert(
        multicallMock.updateTotalRewardsAndTransferRewards(
          rewardsDelta,
          sender2,
          {
            from: sender1,
          }
        ),
        'RewardEthToken: cannot transfer during rewards update'
      );
    });

    it('can transfer rewards before total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        stakedEthToken.address,
        rewardEthToken.address,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);

      await rewardEthToken.approve(multicallMock.address, rewardAmount1, {
        from: sender1,
      });

      const rewardsDelta = ether('10');
      let receipt = await multicallMock.transferRewardsAndUpdateTotalRewards(
        rewardsDelta,
        sender2,
        {
          from: sender1,
        }
      );

      await expectEvent.inTransaction(receipt.tx, RewardEthToken, 'Transfer', {
        from: sender1,
        to: sender2,
        value: rewardAmount1,
      });
    });
  });

  describe('migrate', () => {
    const stakedAmount = ether('1');
    const rewardAmount = ether('1');
    let vaultMock;

    beforeEach(async () => {
      vaultMock = await VaultMock.new(rewardEthToken.address);
      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, vaultMock.address);
      await addStakedEthToken(stakedEthToken, sender, stakedAmount);
      await addRewardEthToken(rewardEthToken, sender, rewardAmount);
    });

    it('cannot migrate to zero address receiver', async () => {
      await expectRevert(
        rewardEthToken.migrate(
          constants.ZERO_ADDRESS,
          stakedAmount,
          rewardAmount,
          {
            from: sender,
          }
        ),
        'RewardEthToken: invalid receiver'
      );
    });

    it('cannot migrate after total rewards update in the same block', async () => {
      const multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedEthToken,
        contracts.rewardEthToken,
        merkleDistributor
      );
      await rewardEthToken.transfer(multicallMock.address, ether('1'), {
        from: sender,
      });
      await stakedEthToken.transfer(multicallMock.address, ether('1'), {
        from: sender,
      });
      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);

      const rewardsDelta = ether('10');
      await expectRevert(
        multicallMock.updateTotalRewardsAndMigrate(rewardsDelta, {
          from: sender,
        }),
        'RewardEthToken: cannot migrate during rewards update'
      );
    });

    it('deducts penalty from user assets', async () => {
      let penalty = ether('-10');
      await vaultMock.updateTotalRewards(penalty, {
        from: vault,
      });
      let totalPenalty = await rewardEthToken.totalPenalty();
      const totalRewards = await rewardEthToken.totalSupply();
      const totalStaked = await stakedEthToken.totalSupply();

      await rewardEthToken.migrate(sender, stakedAmount, rewardAmount, {
        from: sender,
      });

      expect(await rewardEthToken.totalPenalty()).to.be.bignumber.lessThan(
        totalPenalty
      );
      expect(await vaultMock.migratedAssets()).to.be.bignumber.lessThan(
        stakedAmount.add(rewardAmount)
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: totalStaked.sub(stakedAmount),
        account: sender,
        balance: new BN(0),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards.sub(rewardAmount),
        account: sender,
        balance: new BN(0),
      });
    });

    it('cannot migrate zero assets', async () => {
      await expectRevert(
        rewardEthToken.migrate(sender, new BN(0), new BN(0), {
          from: sender,
        }),
        'RewardEthToken: zero assets'
      );
    });

    it('cannot migrate rETH2 larger than balance', async () => {
      await expectRevert(
        rewardEthToken.migrate(
          sender,
          stakedAmount.add(new BN(1)),
          rewardAmount,
          {
            from: sender,
          }
        ),
        'SafeMath: subtraction overflow'
      );
    });

    it('cannot migrate sETH2 larger than balance', async () => {
      await expectRevert(
        rewardEthToken.migrate(
          sender,
          stakedAmount,
          rewardAmount.add(new BN(1)),
          {
            from: sender,
          }
        ),
        'SafeMath: subtraction overflow'
      );
    });

    it('can migrate sETH2 and rETH2', async () => {
      let totalRewards = await rewardEthToken.totalSupply();
      let totalStaked = await stakedEthToken.totalSupply();
      let receipt = await rewardEthToken.migrate(
        sender,
        stakedAmount,
        rewardAmount,
        {
          from: sender,
        }
      );
      const assets = stakedAmount.add(rewardAmount);
      totalRewards = totalRewards.sub(rewardAmount);
      totalStaked = totalStaked.sub(stakedAmount);

      await expectEvent.inTransaction(receipt.tx, VaultMock, 'Migrated', {
        receiver: sender,
        assets,
      });

      await expectEvent.inTransaction(receipt.tx, RewardEthToken, 'Transfer', {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: rewardAmount,
      });

      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: stakedAmount,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: totalStaked,
        account: sender,
        balance: new BN(0),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender,
        balance: new BN(0),
      });

      expect(await rewardEthToken.totalSupply()).to.be.bignumber.equal(
        totalRewards
      );
      expect(await stakedEthToken.totalSupply()).to.be.bignumber.equal(
        totalStaked
      );
      expect(await vaultMock.migratedAssets()).to.be.bignumber.equal(
        stakedAmount.add(rewardAmount)
      );
    });
  });
});
