const hre = require('hardhat');
const { white, green } = require('chalk');
const { contractSettings, contracts } = require('./settings');
const { deployAndInitializeStakeWiseToken } = require('./tokens');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  log(white('Nothing to prepare...'));
}

async function upgradeContracts() {
  let stakeWiseTokenContractAddress = await deployAndInitializeStakeWiseToken(
    contractSettings.admin
  );
  log(
    white(
      `Deployed StakeWise token contract: ${green(
        stakeWiseTokenContractAddress
      )}`
    )
  );

  return {
    ...contracts,
    stakeWiseToken: stakeWiseTokenContractAddress,
  };
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
