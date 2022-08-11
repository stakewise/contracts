const { contracts, contractSettings} = require('./settings');
const {ethers} = require("hardhat");

async function upgradePool() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const Pool = await ethers.getContractFactory('Pool', signer);

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.pool, Pool);
  await proxy.deployed();
}

async function upgradeRewardEthToken(feesEscrowContractAddress) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const RewardEthToken = await ethers.getContractFactory('RewardEthToken', signer);
  let rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);

  // pause
  if (!(await rewardEthToken.paused())) {
    await rewardEthToken.pause();
  }

  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.rewardEthToken, RewardEthToken);
  await proxy.deployed();

  // call upgrade
  await rewardEthToken.upgrade(feesEscrowContractAddress);

  return rewardEthToken.unpause();
}

async function deployContracts() {
  const FeesEscrow = await ethers.getContractFactory('FeesEscrow');
  const feesEscrow = await FeesEscrow.deploy(contracts.pool, contracts.rewardEthToken);
  log('Deployed FeesEscrow contract:', feesEscrow.address);

  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  const rewardEthToken = await upgrades.prepareUpgrade(contracts.rewardEthToken, RewardEthToken);
  log('Deployed RewardEthToken implementation contract:', contracts.rewardEthToken);

  return { feesEscrow };
}

async function upgradeContracts() {
  const { feesEscrow } = await deployContracts();

  await upgradePool();
  await upgradeRewardEthToken(feesEscrow.address);

  return {
    ...contracts,
    feesEscrow: feesEscrow.address,
  };
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
