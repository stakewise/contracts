const { hexlify, keccak256, defaultAbiCoder } = require('ethers/lib/utils');
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
const { contractSettings } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkRewardToken,
  setTotalRewards,
  setupOracleAccounts,
  stakeGNO,
} = require('../utils');

const StakedToken = artifacts.require('StakedToken');
const RewardToken = artifacts.require('RewardToken');
const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const MulticallMock = artifacts.require('MulticallMock');
const protocolFee = new BN(1000);

contract('RewardToken', ([sender, merkleDistributor, ...accounts]) => {
  const admin = contractSettings.admin;
  let stakedToken, rewardToken, totalSupply, pool, oracles, oracleAccounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));

    let contracts = await upgradeContracts();

    stakedToken = await StakedToken.at(contracts.stakedToken);
    rewardToken = await RewardToken.at(contracts.rewardToken);

    pool = await Pool.at(contracts.pool);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await setupOracleAccounts({ oracles, admin, accounts });
    totalSupply = await rewardToken.totalSupply();
    await rewardToken.setProtocolFee(protocolFee, { from: admin });

    await stakeGNO({ account: sender, amount: ether('1'), pool });
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

    it('oracles can update rewards', async () => {
      let prevTotalRewards = await rewardToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(ether('10'));
      let receipt = await setTotalRewards({
        rewardToken,
        oracles,
        pool,
        totalRewards: newTotalRewards,
        oracleAccounts,
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

    it('oracles can update rewards', async () => {
      await rewardToken.setProtocolFeeRecipient(admin, {
        from: admin,
      });
      let prevTotalRewards = await rewardToken.totalRewards();
      let newTotalRewards = prevTotalRewards.add(ether('10'));
      let receipt = await setTotalRewards({
        rewardToken,
        oracles,
        pool,
        totalRewards: newTotalRewards,
        oracleAccounts,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: newTotalRewards.sub(prevTotalRewards),
          totalRewards: newTotalRewards,
          protocolReward: new BN(0),
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
        oracles,
        pool,
        totalRewards: newTotalRewards,
        oracleAccounts,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        RewardToken,
        'RewardsUpdated',
        {
          periodRewards: newTotalRewards.sub(prevTotalRewards),
          totalRewards: newTotalRewards,
          protocolReward: periodReward
            .mul(await rewardToken.protocolFee())
            .div(new BN(10000)),
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
      await stakeGNO({ account: sender1, amount: stakedAmount1, pool });
      await stakeGNO({ account: sender2, amount: stakedAmount2, pool });

      totalSupply = (await rewardToken.totalSupply()).add(ether('10'));
      await setTotalRewards({
        totalRewards: totalSupply,
        rewardToken,
        pool,
        oracles,
        oracleAccounts,
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
      await oracles.addOracle(multicallMock.address, {
        from: admin,
      });

      await rewardToken.approve(multicallMock.address, rewardAmount1, {
        from: sender1,
      });

      let currentNonce = await oracles.currentRewardsNonce();
      let totalRewards = (await rewardToken.totalRewards()).add(ether('10'));
      let activatedValidators = await pool.activatedValidators();
      let signatures = [];
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          currentNonce.toString(),
          activatedValidators.toString(),
          totalRewards.toString(),
        ]
      );
      let candidateId = hexlify(keccak256(encoded));
      for (const oracleAccount of oracleAccounts) {
        signatures.push(await web3.eth.sign(candidateId, oracleAccount));
      }

      await expectRevert(
        multicallMock.updateTotalRewardsAndTransferRewards(
          totalRewards,
          activatedValidators,
          sender2,
          signatures,
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
      await oracles.addOracle(multicallMock.address, {
        from: admin,
      });

      await rewardToken.approve(multicallMock.address, rewardAmount1, {
        from: sender1,
      });

      let currentNonce = await oracles.currentRewardsNonce();
      let totalRewards = (await rewardToken.totalRewards()).add(ether('10'));
      let activatedValidators = await pool.activatedValidators();
      let signatures = [];
      let encoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          currentNonce.toString(),
          activatedValidators.toString(),
          totalRewards.toString(),
        ]
      );
      let candidateId = hexlify(keccak256(encoded));
      for (const oracleAccount of oracleAccounts) {
        signatures.push(await web3.eth.sign(candidateId, oracleAccount));
      }

      let receipt = await multicallMock.transferRewardsAndUpdateTotalRewards(
        totalRewards,
        activatedValidators,
        sender2,
        signatures,
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
});
