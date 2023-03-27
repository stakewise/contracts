const { contracts, contractSettings } = require('../../deployments/settings');
const { impersonateAccount, resetFork } = require('../utils');
const { upgradeContracts } = require('../../deployments');
const {
  send,
  ether,
  expectRevert,
  BN,
  balance,
} = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const Pool = artifacts.require('Pool');
const FeesEscrow = artifacts.require('FeesEscrow');

let feesEscrow;
let pool;
let rewardEthToken;

contract('FeesEscrow', (accounts) => {
  let [sender] = accounts;

  beforeEach(async () => {
    await impersonateAccount(contractSettings.admin);
    await send.ether(sender, contractSettings.admin, ether('2'));
    let upgradedContracts = await upgradeContracts();

    const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
    rewardEthToken = await RewardEthToken.attach(
      upgradedContracts.rewardEthToken
    );
    feesEscrow = await FeesEscrow.at(upgradedContracts.feesEscrow);
    pool = await Pool.at(upgradedContracts.pool);

    // Zero balance for Pool contract before each test
    await network.provider.send('hardhat_setBalance', [
      upgradedContracts.pool,
      '0x0',
    ]);
  });

  afterEach(async () => resetFork());

  it('transferToPool from RewardEthToken', async () => {
    await impersonateAccount(contracts.oracles);
    const oraclesSigner = await ethers.getSigner(contracts.oracles);
    const feesEscrowBalance = await balance.current(contracts.feesEscrow);
    const feesAmount = ether('1');

    // Ensure zero balances before miner's reward distribution to FeesEscrow contract
    const poolBalanceBefore = await balance.current(pool.address);
    expect(poolBalanceBefore.toString()).to.be.bignumber.equal(new BN('0'));

    // Send fees from "validator" to FeesEscrow contract
    await send.ether(sender, feesEscrow.address, feesAmount.toString());

    // set oracles balance to call rewardEthToken.updateTotalRewards()
    await ethers.provider.send('hardhat_setBalance', [
      oraclesSigner.address,
      '0x100000000000000000',
    ]);

    const newTotalRewards = ether('100000');
    await rewardEthToken
      .connect(oraclesSigner)
      .updateTotalRewards(newTotalRewards.toString());

    // Ensure all fees transferred from FeesEscrow contract to Pool contract
    const poolBalanceAfter = await balance.current(pool.address);
    expect(poolBalanceAfter.toString()).to.be.bignumber.equal(
      poolBalanceBefore.add(feesEscrowBalance).add(feesAmount).toString()
    );

    const feesEscrowBalanceAfterTransfer = await balance.current(
      feesEscrow.address
    );
    expect(feesEscrowBalanceAfterTransfer.toString()).to.be.bignumber.equal(
      new BN('0')
    );
  });

  it('transferToPool from invalid caller', async () => {
    // Send fees from "validator" to FeesEscrow contract
    await send.ether(sender, feesEscrow.address, ether('1').toString());
    await expectRevert(
      feesEscrow.transferToPool(),
      'FeesEscrow: invalid caller'
    );
  });
});
