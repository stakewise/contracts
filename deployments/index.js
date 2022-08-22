const { contracts, contractSettings } = require('./settings');
const { ethers } = require('hardhat');

const SymmetricPoolId =
  '0x650f5d96e83d3437bf5382558cb31f0ac5536684000200000000000000000001';

async function upgradeRewardEthToken(feesEscrowContractAddress) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const RewardEthToken = await ethers.getContractFactory('RewardToken', signer);
  let rewardToken = await RewardEthToken.attach(contracts.rewardToken);

  // pause
  if (!(await rewardToken.paused())) {
    await rewardToken.pause();
  }

  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardToken,
    RewardEthToken
  );
  await proxy.deployed();

  // call upgrade
  await rewardToken.upgrade(feesEscrowContractAddress);

  return rewardToken.unpause();
}

async function deployContracts() {
  const FeesEscrow = await ethers.getContractFactory('FeesEscrow');
  const feesEscrow = await FeesEscrow.deploy(
    contracts.pool,
    contracts.rewardToken,
    SymmetricPoolId,
    contracts.GNOVault,
    contracts.WXDAIToken,
    contracts.MGNOWrapper,
    contracts.GNOToken,
    contracts.MGNOToken
  );
  log('Deployed FeesEscrow contract:', feesEscrow.address);

  const RewardToken = await ethers.getContractFactory('RewardToken');
  const rewardToken = await upgrades.prepareUpgrade(
    contracts.rewardToken,
    RewardToken
  );
  log('Deployed rewardToken implementation contract:', contracts.rewardToken);

  return { feesEscrow, rewardToken };
}

async function upgradeContracts() {
  const { feesEscrow } = await deployContracts();

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
