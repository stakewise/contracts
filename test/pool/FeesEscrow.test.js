const { send, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { contracts, contractSettings } = require('../../deployments/settings');
const { impersonateAccount, resetFork } = require('../utils');
const { upgradeContracts } = require('../../deployments');

const Pool = artifacts.require('Pool');
const FeesEscrow = artifacts.require('FeesEscrow');

let feesEscrow;
let pool;
let rewardToken;
let mgnoToken;

contract('FeesEscrow', (accounts) => {
  let [sender] = accounts;

  beforeEach(async () => {
    await impersonateAccount(contractSettings.admin);
    await send.ether(sender, contractSettings.admin, ether('2'));
    let upgradedContracts = await upgradeContracts();

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const RewardToken = await ethers.getContractFactory('RewardToken');
    rewardToken = await RewardToken.attach(upgradedContracts.rewardToken);
    pool = await Pool.at(upgradedContracts.pool);
    mgnoToken = await ERC20Mock.attach(contracts.MGNOToken);
    feesEscrow = await FeesEscrow.at(upgradedContracts.feesEscrow);
  });

  afterEach(async () => resetFork());

  it('transferToPool from RewardToken', async () => {
    // eslint-disable-next-line no-unused-vars
    const [_, validator] = await ethers.getSigners();
    await impersonateAccount(contracts.oracles);
    const oraclesSigner = await ethers.getSigner(contracts.oracles);

    // Ensure zero balances before miner's reward distribution to FeesEscrow contract
    const poolBalanceBefore = await mgnoToken.balanceOf(pool.address);

    // Fund "Validator" address
    const validatorReward = ethers.utils.parseEther('10');
    await ethers.provider.send('hardhat_setBalance', [
      validator.address,
      '0x1000000000000000000000',
    ]);

    // Prepare for calling RewardToken.updateTotalRewards
    const totalRewards = await rewardToken.totalRewards();
    const newTotalRewards = totalRewards.add(validatorReward);

    // Fund Oracles with balance for transaction fees
    await ethers.provider.send('hardhat_setBalance', [
      oraclesSigner.address,
      '0x1000000000000000000000',
    ]);

    // Transfer reward from Validator to FeesEscrow
    await validator.sendTransaction({
      to: feesEscrow.address,
      value: validatorReward,
    });

    // Now call the RewardToken.updateTotalRewards by Oracles
    await rewardToken
      .connect(oraclesSigner)
      .updateTotalRewards(newTotalRewards);

    // Ensure Pool GNO balance increased
    const poolBalanceAfter = await mgnoToken.balanceOf(pool.address);
    expect(poolBalanceAfter.gt(poolBalanceBefore)).to.be.true;

    // FeeEscrow balances should be zero after updateTotalRewards
    const feesEscrowNativeBalanceAfter = await ethers.provider.getBalance(
      feesEscrow.address
    );
    const feesEscrowBalanceAfter = await mgnoToken.balanceOf(
      feesEscrow.address
    );

    expect(feesEscrowNativeBalanceAfter.toString()).to.equal('0');
    expect(feesEscrowBalanceAfter.toString()).to.equal('0');
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
