const hre = require('hardhat');
const { contracts } = require('./settings');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  log('No contracts to prepare for upgrade...');
}

async function upgradeContracts() {
  log('No contracts to upgrade...');
  return contracts;
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
