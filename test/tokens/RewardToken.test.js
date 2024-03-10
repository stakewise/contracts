const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts, upgradeRewardToken } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkRewardToken,
  setTotalRewards,
  addStakedToken,
  addRewardToken,
  checkStakedToken,
} = require('../utils');
const { ethers } = require('hardhat');

const StakedToken = artifacts.require('StakedToken');
const RewardToken = artifacts.require('RewardToken');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');
const VaultMock = artifacts.require('VaultMock');
const protocolFee = new BN(1000);

contract('RewardToken', ([sender, merkleDistributor, vault, ...others]) => {
  const admin = contractSettings.admin;
  let stakedToken, rewardToken, totalSupply, oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));

    let contracts = await upgradeContracts(vault);

    stakedToken = await StakedToken.at(contracts.stakedToken);
    rewardToken = await RewardToken.at(contracts.rewardToken);

    oracles = await Oracles.at(contracts.oracles);
    totalSupply = await rewardToken.totalSupply();
    await rewardToken.setProtocolFee(protocolFee, { from: admin });
  });

  afterEach(async () => resetFork());

  describe('restricted actions', () => {
    it('not admin fails to update protocol fee recipient address', async () => {
      await expectRevert(
        rewardToken.setProtocolFeeRecipient(sender, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('can set zero address for the protocol fee recipient', async () => {
      let receipt = await rewardToken.setProtocolFeeRecipient(
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
      let receipt = await rewardToken.setProtocolFeeRecipient(sender, {
        from: admin,
      });

      await expectEvent(receipt, 'ProtocolFeeRecipientUpdated', {
        recipient: sender,
      });
    });

    it('not admin fails to update protocol fee', async () => {
      await expectRevert(
        rewardToken.setProtocolFee(9999, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update protocol fee', async () => {
      let receipt = await rewardToken.setProtocolFee(9999, {
        from: admin,
      });

      await expectEvent(receipt, 'ProtocolFeeUpdated', {
        protocolFee: '9999',
      });
    });

    it('fails to set invalid protocol fee', async () => {
      await expectRevert(
        rewardToken.setProtocolFee(10000, {
          from: admin,
        }),
        'RewardToken: invalid protocol fee'
      );
    });

    it('only StakedToken contract can disable rewards', async () => {
      await expectRevert(
        rewardToken.setRewardsDisabled(sender, true, {
          from: admin,
        }),
        'RewardToken: access denied'
      );
    });
  });

  describe('updateTotalRewards', () => {
    it('anyone cannot update rewards', async () => {
      await expectRevert(
        rewardToken.updateTotalRewards(ether('10'), {
          from: sender,
        }),
        'RewardToken: access denied'
      );
      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender,
        balance: new BN(0),
      });
    });

    it('vault can update rewards', async () => {
      let prevTotalRewards = await rewardToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(ether('10'));
      let receipt = await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: newTotalRewards,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: newTotalRewards.sub(prevTotalRewards),
          totalRewards: newTotalRewards,
        }
      );
    });

    it('assigns protocol fee to distributor', async () => {
      await rewardToken.setProtocolFeeRecipient(constants.ZERO_ADDRESS, {
        from: admin,
      });

      let periodReward = ether('10');
      let prevTotalRewards = await rewardToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(periodReward);
      let receipt = await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: newTotalRewards,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: periodReward,
          totalRewards: newTotalRewards,
          protocolReward: periodReward
            .mul(await rewardToken.protocolFee())
            .div(new BN(10000)),
        }
      );
    });

    it('accumulates penalty', async () => {
      let penalty = ether('10');
      let totalRewards = await rewardToken.totalRewards();
      let totalPenalty = await rewardToken.totalPenalty();

      let receipt = await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: totalRewards.sub(penalty),
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: '0',
          totalRewards: totalRewards,
          protocolReward: '0',
        }
      );
      totalPenalty = totalPenalty.add(ether('10'));
      expect(await rewardToken.totalPenalty()).to.bignumber.equal(totalPenalty);

      // reduces penalty partially
      let periodReward = ether('5');
      totalPenalty = totalPenalty.sub(periodReward);
      receipt = await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: totalRewards.add(periodReward),
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: '0',
          totalRewards: totalRewards,
          protocolReward: '0',
        }
      );
      expect(await rewardToken.totalPenalty()).to.bignumber.equal(totalPenalty);

      // reduces penalty completely
      periodReward = ether('1');
      receipt = await setTotalRewards({
        rewardToken,
        vault,
        totalRewards: totalRewards.add(periodReward).add(totalPenalty),
      });
      totalPenalty = new BN(0);
      totalRewards = totalRewards.add(periodReward);
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: periodReward,
          totalRewards: totalRewards,
          protocolReward: periodReward
            .mul(await rewardToken.protocolFee())
            .div(new BN(10000)),
        }
      );
      expect(await rewardToken.totalPenalty()).to.bignumber.equal(totalPenalty);
    });

    it('penalty cannot exceed total assets', async () => {
      let totalAssets = await rewardToken.totalAssets();

      await expectRevert(
        rewardToken.updateTotalRewards(totalAssets.add(new BN(1)).neg(), {
          from: vault,
        }),
        'RewardToken: invalid penalty amount'
      );
    });
  });

  describe('transfer', () => {
    const stakedAmount1 = ether('4');
    const stakedAmount2 = ether('5');
    const [sender1, sender2] = others;
    let rewardAmount1, rewardAmount2;

    beforeEach(async () => {
      await addStakedToken(stakedToken, sender1, stakedAmount1);
      await addStakedToken(stakedToken, sender2, stakedAmount2);

      totalSupply = (await rewardToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards: totalSupply,
        rewardToken,
        vault,
      });

      rewardAmount1 = await rewardToken.balanceOf(sender1);
      rewardAmount2 = await rewardToken.balanceOf(sender2);
      expect(rewardAmount2.gt(rewardAmount1)).to.equal(true);
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        rewardToken.transfer(constants.ZERO_ADDRESS, stakedAmount1, {
          from: sender1,
        }),
        'RewardToken: invalid receiver'
      );

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        rewardToken.transferFrom(
          constants.ZERO_ADDRESS,
          sender2,
          rewardAmount1,
          {
            from: sender1,
          }
        ),
        'RewardToken: invalid sender'
      );

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('can transfer zero amount', async () => {
      let receipt = await stakedToken.transfer(sender2, ether('0'), {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: ether('0'),
      });

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await rewardToken.pause({ from: admin });
      expect(await rewardToken.paused()).equal(true);

      await expectRevert(
        rewardToken.transfer(sender2, rewardAmount1, {
          from: sender1,
        }),
        'Pausable: paused'
      );

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
      await rewardToken.unpause({ from: admin });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        rewardToken.transfer(sender2, stakedAmount1.add(ether('1')), {
          from: sender1,
        }),
        'SafeMath: subtraction overflow'
      );

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: rewardAmount1,
      });
    });

    it('can transfer reward tokens to different account', async () => {
      let receipt = await rewardToken.transfer(sender2, rewardAmount1, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: rewardAmount1,
      });

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkRewardToken({
        rewardToken,
        totalSupply,
        account: sender2,
        balance: rewardAmount1.add(rewardAmount2),
      });
    });

    it('cannot transfer rewards after total rewards update in the same block', async () => {
      // deploy mocked oracle
      let multicallMock = await MulticallMock.new(
        oracles.address,
        stakedToken.address,
        rewardToken.address,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, multicallMock.address);

      await rewardToken.approve(multicallMock.address, rewardAmount1, {
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
        'RewardToken: cannot transfer during rewards update'
      );
    });

    it('can transfer rewards before total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        stakedToken.address,
        rewardToken.address,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, multicallMock.address);

      await rewardToken.approve(multicallMock.address, rewardAmount1, {
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

      await expectEvent.inTransaction(receipt.tx, RewardToken, 'Transfer', {
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
      vaultMock = await VaultMock.new(rewardToken.address);
      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, vaultMock.address);
      await addStakedToken(stakedToken, sender, stakedAmount);
      await addRewardToken(rewardToken, sender, rewardAmount);
    });

    it('cannot migrate to zero address receiver', async () => {
      await expectRevert(
        rewardToken.migrate(
          constants.ZERO_ADDRESS,
          stakedAmount,
          rewardAmount,
          {
            from: sender,
          }
        ),
        'RewardToken: invalid receiver'
      );
    });

    it('cannot migrate after total rewards update in the same block', async () => {
      const multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedToken,
        contracts.rewardToken,
        merkleDistributor
      );
      await rewardToken.transfer(multicallMock.address, ether('1'), {
        from: sender,
      });
      await stakedToken.transfer(multicallMock.address, ether('1'), {
        from: sender,
      });
      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, multicallMock.address);

      const rewardsDelta = ether('10');
      await expectRevert(
        multicallMock.updateTotalRewardsAndMigrate(rewardsDelta, {
          from: sender,
        }),
        'RewardToken: cannot migrate during rewards update'
      );
    });

    it('deducts penalty from user assets', async () => {
      let penalty = ether('-10');
      await vaultMock.updateTotalRewards(penalty, {
        from: vault,
      });
      let totalPenalty = await rewardToken.totalPenalty();
      const totalRewards = await rewardToken.totalSupply();
      const totalStaked = await stakedToken.totalSupply();

      await rewardToken.migrate(sender, stakedAmount, rewardAmount, {
        from: sender,
      });

      expect(await rewardToken.totalPenalty()).to.be.bignumber.lessThan(
        totalPenalty
      );
      expect(await vaultMock.migratedAssets()).to.be.bignumber.lessThan(
        stakedAmount.add(rewardAmount)
      );

      await checkStakedToken({
        stakedToken,
        totalSupply: totalStaked.sub(stakedAmount),
        account: sender,
        balance: new BN(0),
      });

      await checkRewardToken({
        rewardToken,
        totalSupply: totalRewards.sub(rewardAmount),
        account: sender,
        balance: new BN(0),
      });
    });

    it('cannot migrate zero assets', async () => {
      await expectRevert(
        rewardToken.migrate(sender, new BN(0), new BN(0), {
          from: sender,
        }),
        'RewardToken: zero assets'
      );
    });

    it('cannot migrate reward tokens larger than balance', async () => {
      await expectRevert(
        rewardToken.migrate(sender, stakedAmount.add(new BN(1)), rewardAmount, {
          from: sender,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('cannot migrate staked tokens larger than balance', async () => {
      await expectRevert(
        rewardToken.migrate(sender, stakedAmount, rewardAmount.add(new BN(1)), {
          from: sender,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('can migrate reward and staked tokens', async () => {
      let totalRewards = await rewardToken.totalSupply();
      let totalStaked = await stakedToken.totalSupply();
      let receipt = await rewardToken.migrate(
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

      await expectEvent.inTransaction(receipt.tx, RewardToken, 'Transfer', {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: rewardAmount,
      });

      await expectEvent.inTransaction(receipt.tx, StakedToken, 'Transfer', {
        from: sender,
        to: constants.ZERO_ADDRESS,
        value: stakedAmount,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply: totalStaked,
        account: sender,
        balance: new BN(0),
      });

      await checkRewardToken({
        rewardToken,
        totalSupply: totalRewards,
        account: sender,
        balance: new BN(0),
      });

      expect(await rewardToken.totalSupply()).to.be.bignumber.equal(
        totalRewards
      );
      expect(await stakedToken.totalSupply()).to.be.bignumber.equal(
        totalStaked
      );
      expect(await vaultMock.migratedAssets()).to.be.bignumber.equal(
        stakedAmount.add(rewardAmount)
      );
    });
  });
});
