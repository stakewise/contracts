const { white } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');
const {
  silenceWarnings,
} = require('@openzeppelin/upgrades-core/dist/utils/log');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradePool(signer) {
  const Pool = await ethers.getContractFactory('Pool', signer);

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.pool, Pool, {
    unsafeAllow: ['state-variable-immutable', 'constructor'],
    constructorArgs: [contracts.poolEscrow],
  });
  await proxy.deployed();
}

async function upgradeOracles(signer) {
  const Oracles = await ethers.getContractFactory('Oracles', signer);

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.oracles, Oracles);
  await proxy.deployed();
}

async function upgradeRewardToken(signer, vault) {
  const RewardToken = await ethers.getContractFactory('RewardToken', signer);
  // upgrade RewardToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardToken,
    RewardToken,
    {
      unsafeAllow: ['state-variable-immutable', 'constructor'],
      constructorArgs: [vault],
    }
  );
  await proxy.deployed();
}

async function upgradeStakedToken(signer) {
  const StakedToken = await ethers.getContractFactory('StakedToken', signer);
  // upgrade RewardToken to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.stakedToken, StakedToken);
  await proxy.deployed();
}

async function deployContracts() {
  return contracts;
}

async function upgradeContracts(vault = contracts.vault) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  silenceWarnings();
  await upgradeOracles(signer);
  log(white('Upgraded Oracles contract'));

  await upgradePool(signer);
  log(white('Upgraded Pool contract'));

  await upgradeRewardToken(signer, vault);
  log(white('Upgraded RewardToken contract'));

  await upgradeStakedToken(signer);
  log(white('Upgraded StakedToken contract'));

  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
  upgradeRewardToken,
};
