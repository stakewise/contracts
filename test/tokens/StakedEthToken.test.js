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
  getOracleAccounts,
  setTotalRewards,
  setRewardsVotingPeriod,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const OracleMock = artifacts.require('OracleMock');

contract('StakedEthToken', ([merkleDistributor, sender1, sender2]) => {
  const admin = contractSettings.admin;
  let stakedEthToken,
    rewardEthToken,
    pool,
    totalSupply,
    oracles,
    oracleAccounts;

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender1, admin, ether('5'));

    await upgradeContracts();

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    pool = await Pool.at(contracts.pool);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);

    totalSupply = await stakedEthToken.totalSupply();
  });

  after(async () => stopImpersonatingAccount(admin));

  afterEach(async () => resetFork());

  describe('mint', () => {
    it('anyone cannot mint sETH2 tokens', async () => {
      await expectRevert(
        stakedEthToken.mint(sender1, ether('10'), {
          from: sender1,
        }),
        'StakedEthToken: access denied'
      );
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });
    });

    it('updates distributor principal when deposited by account with disabled rewards', async () => {
      // disable rewards
      const currentPrincipal = await stakedEthToken.distributorPrincipal();
      await stakedEthToken.toggleRewards(sender1, true, { from: admin });
      let amount = ether('10');
      let receipt = await pool.addDeposit({
        from: sender1,
        value: amount,
      });
      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value: amount,
      });
      expect(await stakedEthToken.distributorPrincipal()).to.bignumber.equal(
        currentPrincipal.add(amount)
      );
    });
  });

  describe('transfer', () => {
    let value = ether('10');

    beforeEach(async () => {
      await pool.setMinActivatingDeposit(value.add(ether('1')), {
        from: admin,
      });
      await pool.addDeposit({
        from: sender1,
        value,
      });
      totalSupply = totalSupply.add(value);
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
        admin,
        totalRewards,
        rewardEthToken,
        pool,
        oracles,
        oracleAccounts,
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
      const currentPrincipal = await stakedEthToken.distributorPrincipal();
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
        currentPrincipal.add(value)
      );
    });

    it('updates distributor principal when transferring from account with disabled rewards', async () => {
      await stakedEthToken.toggleRewards(sender1, true, { from: admin });
      const currentPrincipal = await stakedEthToken.distributorPrincipal();
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
        currentPrincipal.sub(value)
      );
    });

    it('does not update distributor principal when transferring between accounts with disabled rewards', async () => {
      await stakedEthToken.toggleRewards(sender1, true, { from: admin });
      await stakedEthToken.toggleRewards(sender2, true, { from: admin });
      const currentPrincipal = await stakedEthToken.distributorPrincipal();
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
        currentPrincipal
      );
    });

    it('cannot transfer staked amount after total rewards update in the same block', async () => {
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
        merkleDistributor
      );
      await oracles.addOracle(mockedOracle.address, {
        from: admin,
      });

      await stakedEthToken.approve(mockedOracle.address, value, {
        from: sender1,
      });

      // wait for rewards voting time
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);

      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      let activatedValidators = await pool.activatedValidators();

      await expectRevert(
        mockedOracle.updateTotalRewardsAndTransferStakedEth(
          totalRewards,
          activatedValidators,
          sender2,
          {
            from: sender1,
          }
        ),
        'StakedEthToken: cannot transfer during rewards update'
      );
    });

    it('can transfer staked amount before total rewards update in the same block', async () => {
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
        merkleDistributor
      );
      await oracles.addOracle(mockedOracle.address, {
        from: admin,
      });

      await stakedEthToken.approve(mockedOracle.address, value, {
        from: sender1,
      });

      // wait for rewards voting time
      await setRewardsVotingPeriod(rewardEthToken, oracles, admin);

      let totalRewards = (await rewardEthToken.totalRewards()).add(ether('10'));
      let activatedValidators = await pool.activatedValidators();

      let receipt = await mockedOracle.transferStakedEthAndUpdateTotalRewards(
        totalRewards,
        activatedValidators,
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
  });
});
