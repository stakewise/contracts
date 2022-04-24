const { white, green } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradeOracles() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const Oracles = await ethers.getContractFactory('Oracles', signer);

  // upgrade Oracles to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.oracles, Oracles);
  return proxy.deployed();
}

async function deployContracts() {
  const Oracles = await ethers.getContractFactory('Oracles');
  let impl = await upgrades.prepareUpgrade(contracts.oracles, Oracles);
  log(white(`Deployed Oracles implementation contract: ${green(impl)}`));
}

async function upgradeContracts() {
  await deployContracts();
  await upgradeOracles();
  log(white('Upgraded Oracles contract'));
  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
