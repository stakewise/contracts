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

async function upgradeRewardEthToken(signer, vault) {
  const RewardEthToken = await ethers.getContractFactory(
    'RewardEthToken',
    signer
  );
  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardEthToken,
    RewardEthToken,
    {
      unsafeAllow: ['state-variable-immutable', 'constructor'],
      constructorArgs: [vault, contracts.pool],
    }
  );
  await proxy.deployed();
}

async function upgradeStakedEthToken(signer) {
  const StakedEthToken = await ethers.getContractFactory(
    'StakedEthToken',
    signer
  );
  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.stakedEthToken,
    StakedEthToken
  );
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

  await upgradeRewardEthToken(signer, vault);
  log(white('Upgraded RewardEthToken contract'));

  await upgradeStakedEthToken(signer);
  log(white('Upgraded StakedEthToken contract'));

  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
  upgradeRewardEthToken,
};
