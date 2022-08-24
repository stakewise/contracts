const { contracts, contractSettings } = require('../../deployments/settings');
const { impersonateAccount, resetFork } = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { send, ether, expectRevert, BN } = require('@openzeppelin/test-helpers');
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
    const feesAmount = ethers.utils.parseEther('1');

    // Ensure zero balances before miner's reward distribution to FeesEscrow contract
    const poolBalanceBefore = await ethers.provider.getBalance(pool.address);
    expect(poolBalanceBefore.toString()).to.be.bignumber.equal(new BN('0'));

    const feesEscrowBalanceBefore = await ethers.provider.getBalance(
      feesEscrow.address
    );
    expect(feesEscrowBalanceBefore.toString()).to.be.bignumber.equal(
      new BN('0')
    );

    // Send fees from "validator" to FeesEscrow contract
    await send.ether(sender, feesEscrow.address, feesAmount.toString());

    // set oracles balance to call rewardEthToken.updateTotalRewards()
    await ethers.provider.send('hardhat_setBalance', [
      oraclesSigner.address,
      '0x100000000000000000',
    ]);

    const newTotalRewards = ethers.utils.parseEther('100000');
    await rewardEthToken
      .connect(oraclesSigner)
      .updateTotalRewards(newTotalRewards);

    // Ensure all fees transferred from FeesEscrow contract to Pool contract
    const poolBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolBalanceAfter.toString()).to.be.bignumber.equal(
      feesAmount.toString()
    );

    const feesEscrowBalanceAfterTransfer = await ethers.provider.getBalance(
      feesEscrow.address
    );
    expect(feesEscrowBalanceAfterTransfer.toString()).to.be.bignumber.equal(
      new BN('0')
    );
  });

  it('transferToPool from invalid caller', async () => {
    // Send fees from "validator" to FeesEscrow contract
    await send.ether(
      sender,
      feesEscrow.address,
      ethers.utils.parseEther('1').toString()
    );

    await expectRevert(
      feesEscrow.transferToPool(),
      'FeesEscrow: invalid caller'
    );
  });
});
