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
  checkStakedEthToken,
  setTotalRewards,
  addStakedEthToken,
} = require('../utils');
const {
  upgradeContracts,
  upgradeRewardEthToken,
} = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { ethers } = require('hardhat');

const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');

contract('StakedEthToken', (accounts) => {
  const admin = contractSettings.admin;
  const [merkleDistributor, sender1, sender2, vault] = accounts;
  let stakedEthToken, rewardEthToken, oracles, totalSupply, totalRewards;

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender1, admin, ether('5'));

    await upgradeContracts(vault);

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    oracles = await Oracles.at(contracts.oracles);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);

    totalRewards = await rewardEthToken.totalRewards();
    totalSupply = await stakedEthToken.totalSupply();
  });

  after(async () => stopImpersonatingAccount(admin));

  afterEach(async () => resetFork());

  describe('transfer', () => {
    let value = ether('10');
    let distributorPrincipal;

    beforeEach(async () => {
      await addStakedEthToken(stakedEthToken, sender1, value);
      distributorPrincipal = await stakedEthToken.distributorPrincipal();
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        stakedEthToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'StakedEthToken: invalid receiver'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        stakedEthToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'StakedEthToken: invalid sender'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
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

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await stakedEthToken.pause({ from: admin });
      expect(await stakedEthToken.paused()).equal(true);

      await expectRevert(
        stakedEthToken.transfer(sender2, value, {
          from: sender1,
        }),
        'Pausable: paused'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
      await stakedEthToken.unpause({ from: admin });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        stakedEthToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'SafeMath: subtraction overflow'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });

    it('can transfer sETH2 tokens to different account', async () => {
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
    });

    it('preserves rewards during sETH2 transfer', async () => {
      let totalRewards = (await rewardEthToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards,
        rewardEthToken,
        vault,
      });

      let rewardAmount = await rewardEthToken.balanceOf(sender1);
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
      });

      expect(await rewardEthToken.balanceOf(sender1)).bignumber.equal(
        rewardAmount
      );
    });

    it('updates distributor principal when transferring to account with disabled rewards', async () => {
      await stakedEthToken.toggleRewards(sender2, true, { from: admin });
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(value)
      );
    });

    it('updates distributor principal when transferring from account with disabled rewards', async () => {
      await stakedEthToken.toggleRewards(sender1, true, { from: admin });
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal
      );
    });

    it('does not update distributor principal when transferring between accounts with disabled rewards', async () => {
      await stakedEthToken.toggleRewards(sender1, true, { from: admin });
      await stakedEthToken.toggleRewards(sender2, true, { from: admin });
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
      });
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        distributorPrincipal.add(value)
      );
    });

    it('cannot transfer staked amount after total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedEthToken,
        contracts.rewardEthToken,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);

      await stakedEthToken.approve(multicallMock.address, value, {
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
        'StakedEthToken: cannot transfer during rewards update'
      );
    });

    it('can transfer staked amount before total rewards update in the same block', async () => {
      // deploy mocked multicall
      let multicallMock = await MulticallMock.new(
        oracles.address,
        contracts.stakedEthToken,
        contracts.rewardEthToken,
        merkleDistributor
      );

      const signer = await ethers.provider.getSigner(contractSettings.admin);
      await upgradeRewardEthToken(signer, multicallMock.address);

      await stakedEthToken.approve(multicallMock.address, value, {
        from: sender1,
      });

      let receipt = await multicallMock.transferStakedEthAndUpdateTotalRewards(
        totalRewards,
        sender2,
        {
          from: sender1,
        }
      );

      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });
    });

    it('cannot burn from not rewardEthToken', async () => {
      await expectRevert(
        stakedEthToken.burn(sender1, value, {
          from: sender1,
        }),
        'StakedEthToken: access denied'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
      });
    });
  });
});
