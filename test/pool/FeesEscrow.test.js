const { contracts, contractSettings } = require('../../deployments/settings');
const {setupOracleAccounts, impersonateAccount} = require("../utils");
const {upgradeContracts} = require("../../deployments");
const {send, ether, BN} = require("@openzeppelin/test-helpers");
const {ethers} = require("hardhat");
const {expect} = require("chai");

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const PoolValidators = artifacts.require('PoolValidators');
const Oracles = artifacts.require('Oracles');

let pool;
let feesEscrow;
let stakedEthToken;
let rewardEthToken;
let validators;
let oracles;
let oracleAccounts;
const admin = contractSettings.admin;

async function upgradeRewardEthToken() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const RewardEthToken = await ethers.getContractFactory(
    'RewardEthToken',
    signer
  );
  let rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);

  // pause
  if (!(await rewardEthToken.paused())) {
    await rewardEthToken.pause();
  }

  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardEthToken,
    RewardEthToken,
    {
      unsafeAllowRenames: true,
    }
  );
  await proxy.deployed();

  const [owner] = await ethers.getSigners();

  return rewardEthToken.unpause();
}

contract('FeesEscrow', (accounts) => {
  let [sender1, sender2, sender3, operator, ...otherAccounts] = accounts;

  beforeEach(async () => {
    await impersonateAccount(admin);
    const adminSigner = await ethers.getSigner(admin);
    await send.ether(sender3, admin, ether('2'));
    let upgradedContracts = await upgradeContracts();

    await upgradeRewardEthToken();
    const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
    rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);

    const Pool = await ethers.getContractFactory('Pool');
    pool = await Pool.deploy();

    const FeesEscrow = await ethers.getContractFactory('FeesEscrow');
    feesEscrow = await FeesEscrow.deploy(pool.address, rewardEthToken.address);

    await rewardEthToken.connect(adminSigner).setFeesEscrow(feesEscrow.address);

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    validators = await PoolValidators.at(upgradedContracts.poolValidators);
    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
  });

  it('transferToPool', async () => {
    await impersonateAccount(contracts.oracles);
    const oraclesSigner = await ethers.getSigner(contracts.oracles);
    const feesAmount = ethers.utils.parseEther('1');
    const [owner] = await ethers.getSigners();

    // Ensure zero balances before miner's reward distribution to FeesEscrow contract
    const poolBalanceBefore = await ethers.provider.getBalance(pool.address);
    expect(poolBalanceBefore.toString()).to.be.bignumber.equal(new BN('0'));

    const feesEscrowBalanceBefore = await ethers.provider.getBalance(feesEscrow.address);
    expect(feesEscrowBalanceBefore.toString()).to.be.bignumber.equal(new BN('0'));

    // Send fees from validator to contract
    await owner.sendTransaction({
      to: feesEscrow.address,
      value: feesAmount,
    });

    // set oracles balance to call rewardEthToken.updateTotalRewards()
    await ethers.provider.send('hardhat_setBalance', [
      oraclesSigner.address,
      '0x100000000000000000',
    ]);

    const newTotalRewards = ethers.utils.parseEther('100000');
    await rewardEthToken.connect(oraclesSigner).updateTotalRewards(newTotalRewards);

    // Ensure all fees transferred from FeesEscrow contract to Pool contract
    const poolBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolBalanceAfter.toString()).to.be.bignumber.equal(feesAmount.toString());

    const feesEscrowBalanceAfterTransfer = await ethers.provider.getBalance(feesEscrow.address);
    expect(feesEscrowBalanceAfterTransfer.toString()).to.be.bignumber.equal(new BN('0'));
  });
});
