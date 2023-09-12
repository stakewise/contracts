const { contracts, contractSettings } = require('../../deployments/settings');
const { impersonateAccount, resetFork } = require('../utils');
const { upgradeContracts } = require('../../deployments');
const {
  send,
  ether,
  expectRevert,
  BN,
  balance
} = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const Pool = artifacts.require('Pool');
const FeesEscrow = artifacts.require('FeesEscrow');

let feesEscrow;
let pool;
let poolEscrow;
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
    poolEscrow = upgradedContracts.poolEscrow;

    // Zero balance for Pool contract before each test
    await network.provider.send('hardhat_setBalance', [
      upgradedContracts.pool,
      '0x0'
    ]);
  });

  afterEach(async () => resetFork());

  it('transfer fees to pool escrow', async () => {
    await impersonateAccount(contracts.vault);
    const vaultSigner = await ethers.getSigner(contracts.vault);
    const feesAmount = ether('1');

    const poolBalanceBefore = await balance.current(pool.address);
    const poolEscrowBalanceBefore = await balance.current(poolEscrow);

    // Send fees from "validator" to FeesEscrow contract
    await send.ether(sender, feesEscrow.address, feesAmount.toString());
    const feesEscrowBalanceBefore = await balance.current(feesEscrow.address);

    // set oracles balance to call rewardEthToken.updateTotalRewards()
    await ethers.provider.send('hardhat_setBalance', [
      vaultSigner.address,
      '0x100000000000000000'
    ]);

    const rewardsDelta = ether('10');
    await rewardEthToken
      .connect(vaultSigner)
      .updateTotalRewards(rewardsDelta.toString());

    // Ensure all fees transferred to Pool escrow
    expect(await balance.current(pool.address)).to.be.bignumber.equal(
      new BN('0')
    );
    expect(await balance.current(feesEscrow.address)).to.be.bignumber.equal(
      new BN('0')
    );
    const poolEscrowBalanceAfter = await balance.current(poolEscrow);
    expect(poolEscrowBalanceAfter).to.be.bignumber.equal(
      poolEscrowBalanceBefore
        .add(feesEscrowBalanceBefore)
        .add(poolBalanceBefore)
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
