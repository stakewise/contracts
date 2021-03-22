const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkRewardEthToken,
  setTotalRewards,
  getOracleAccounts,
} = require('../utils');

const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const maintainerFee = new BN(1000);

contract('RewardEthToken', ([sender, ...accounts]) => {
  const admin = contractSettings.admin;
  let stakedEthToken,
    rewardEthToken,
    maintainer,
    totalSupply,
    pool,
    oracles,
    oracleAccounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));

    await upgradeContracts();

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    pool = await Pool.at(contracts.pool);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    maintainer = await rewardEthToken.maintainer();
    totalSupply = await rewardEthToken.totalSupply();
    await rewardEthToken.setMaintainer(maintainer, { from: admin });
    await rewardEthToken.setMaintainerFee(maintainerFee, { from: admin });
  });

  afterEach(async () => resetFork());

  describe('admin actions', () => {
    it('not admin fails to update maintainer address', async () => {
      await expectRevert(
        rewardEthToken.setMaintainer(sender, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update maintainer address', async () => {
      let receipt = await rewardEthToken.setMaintainer(sender, {
        from: admin,
      });

      await expectEvent(receipt, 'MaintainerUpdated', {
        maintainer: sender,
      });
    });

    it('not admin fails to update maintainer fee', async () => {
      await expectRevert(
        rewardEthToken.setMaintainerFee(9999, {
          from: sender,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update maintainer fee', async () => {
      let receipt = await rewardEthToken.setMaintainerFee(9999, {
        from: admin,
      });

      await expectEvent(receipt, 'MaintainerFeeUpdated', {
        maintainerFee: '9999',
      });
    });

    it('fails to set invalid maintainer fee', async () => {
      await expectRevert(
        rewardEthToken.setMaintainerFee(10000, {
          from: admin,
        }),
        'RewardEthToken: invalid fee'
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

    it('oracles can update rewards', async () => {
      let prevTotalRewards = await rewardEthToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(ether('10'));
      let receipt = await setTotalRewards({
        totalRewards: newTotalRewards,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
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
  });

  describe('transfer', () => {
    const stakedAmount1 = ether('4');
    const stakedAmount2 = ether('5');
    const [sender1, sender2] = accounts;
    let rewardAmount1, rewardAmount2;

    beforeEach(async () => {
      await pool.setMinActivatingDeposit(stakedAmount2.add(ether('1')), {
        from: admin,
      });
      await pool.addDeposit({
        from: sender1,
        value: stakedAmount1,
      });
      await pool.addDeposit({
        from: sender2,
        value: stakedAmount2,
      });

      totalSupply = (await rewardEthToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards: totalSupply,
        rewardEthToken,
        pool,
        oracles,
        oracleAccounts,
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
        'RewardEthToken: invalid amount'
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
  });
});
