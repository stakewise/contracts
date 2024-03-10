const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  checkStakedToken,
  setTotalRewards,
  addStakedToken,
} = require('../utils');
const { upgradeContracts, upgradeRewardToken } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { ethers } = require('hardhat');

const StakedToken = artifacts.require('StakedToken');
const RewardToken = artifacts.require('RewardToken');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');

contract('StakedToken', (accounts) => {
  const admin = contractSettings.admin;
  const [merkleDistributor, sender1, sender2, vault] = accounts;
  let stakedToken, rewardToken, oracles, totalSupply, totalRewards;

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender1, admin, ether('5'));

    await upgradeContracts(vault);

    stakedToken = await StakedToken.at(contracts.stakedToken);
    oracles = await Oracles.at(contracts.oracles);
    rewardToken = await RewardToken.at(contracts.rewardToken);

    totalRewards = await rewardToken.totalRewards();
    totalSupply = await stakedToken.totalSupply();
  });

  after(async () => stopImpersonatingAccount(admin));

  afterEach(async () => resetFork());

  describe('transfer', () => {
    let value = ether('10');
    let distributorPrincipal;

    beforeEach(async () => {
      await addStakedToken(stakedToken, sender1, value);
      distributorPrincipal = await stakedToken.distributorPrincipal();
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        stakedToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'StakedToken: invalid receiver'
      );

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        stakedToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'StakedToken: invalid sender'
      );

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
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

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await stakedToken.pause({ from: admin });
      expect(await stakedToken.paused()).equal(true);

      await expectRevert(
        stakedToken.transfer(sender2, value, {
          from: sender1,
        }),
        'Pausable: paused'
      );

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
      await stakedToken.unpause({ from: admin });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        stakedToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'SafeMath: subtraction overflow'
      );

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('can transfer staked tokens to different account', async () => {
      let receipt = await stakedToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
    });

    it('preserves rewards during staked tokens transfer', async () => {
      let totalRewards = (await rewardToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards,
        rewardToken,
        vault,
      });

      let rewardAmount = await rewardToken.balanceOf(sender1);
      let receipt = await stakedToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: value,
      });

      expect(await rewardToken.balanceOf(sender1)).bignumber.equal(
        rewardAmount
      );
    });

    it('updates distributor principal when transferring to account with disabled rewards', async () => {
      await stakedToken.toggleRewards(sender2, true, { from: admin });
      let receipt = await stakedToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(value)
      );
    });

    it('updates distributor principal when transferring from account with disabled rewards', async () => {
      await stakedToken.toggleRewards(sender1, true, { from: admin });
      let receipt = await stakedToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
    });

    it('does not update distributor principal when transferring between accounts with disabled rewards', async () => {
      await stakedToken.toggleRewards(sender1, true, { from: admin });
      await stakedToken.toggleRewards(sender2, true, { from: admin });
      let receipt = await stakedToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(value)
      );
    });

    it('cannot transfer staked amount after total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedToken,
        contracts.rewardToken,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, multicallMock.address);

      await stakedToken.approve(multicallMock.address, value, {
        from: sender1,
      });

      await expectRevert(
        multicallMock.updateTotalRewardsAndTransferStakedEth(
          totalRewards,
          sender2,
          {
            from: sender1,
          }
        ),
        'StakedToken: cannot transfer during rewards update'
      );
    });

    it('can transfer staked amount before total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedToken,
        contracts.rewardToken,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardToken(signer, multicallMock.address);

      await stakedToken.approve(multicallMock.address, value, {
        from: sender1,
      });

      let receipt = await multicallMock.transferStakedEthAndUpdateTotalRewards(
        totalRewards,
        sender2,
        {
          from: sender1,
        }
      );

      await expectEvent.inTransaction(receipt.tx, StakedToken, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });
    });

    it('cannot burn from not rewardToken', async () => {
      await expectRevert(
        stakedToken.burn(sender1, value, {
          from: sender1,
        }),
        'StakedToken: access denied'
      );

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });
  });
});
