const { white } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradePool() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const Pool = await ethers.getContractFactory('Pool', signer);

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.pool, Pool);
  await proxy.deployed();
}

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
    RewardEthToken
  );
  await proxy.deployed();

  // call upgrade
  await rewardEthToken.upgrade(contracts.feesEscrow);

  return rewardEthToken.unpause();
}

async function deployContracts() {
  return contracts;
}

async function upgradeContracts() {
  await upgradePool();
  log(white('Upgraded Pool contract'));
  await upgradeRewardEthToken();
  log(white('Upgraded RewardEthToken contract'));

  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
