const hre = require('hardhat');
const { contracts } = require('./settings');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  log('Nothing to prepare...');
}

async function upgradeContracts() {
  log('Nothing to upgrade...');
  return contracts;
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
