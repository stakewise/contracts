const { white } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradeRewardEthToken() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const RewardEthToken = await ethers.getContractFactory(
    'RewardEthToken',
    signer
  );
  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardEthToken,
    RewardEthToken
  );
  await proxy.deployed();
}

async function deployContracts() {
  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  const rewardEthToken = await upgrades.prepareUpgrade(
    contracts.rewardEthToken,
    RewardEthToken
  );
  return { rewardEthToken };
}

async function upgradeContracts() {
  await deployContracts();
  await upgradeRewardEthToken();
  log(white('Upgraded RewardEthToken contract'));
  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
