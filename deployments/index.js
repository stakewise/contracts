const hre = require('hardhat');
const { white, green } = require('chalk');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  log('No contracts to prepare for upgrade...');
}

async function deployAnInitializeSwiseStaking(
  adminAddress,
  stakeWiseTokenContractAddress,
  rewardEthTokenContractAddress,
  multipliers,
  durations
) {
  const SwiseStaking = await hre.ethers.getContractFactory('SwiseStaking');
  const proxy = await hre.upgrades.deployProxy(
    SwiseStaking,
    [
      adminAddress,
      stakeWiseTokenContractAddress,
      rewardEthTokenContractAddress,
      multipliers,
      durations,
    ],
    {
      kind: 'transparent',
      unsafeAllowCustomTypes: true,
    }
  );
  await proxy.deployed();
  return proxy.address;
}

async function upgradeContracts() {
  const multipliers = Object.keys(contractSettings.multipliers);
  const durations = multipliers.map(
    (multiplier) => contractSettings.multipliers[multiplier]
  );
  const swiseStaking = await deployAnInitializeSwiseStaking(
    contractSettings.admin,
    contracts.stakeWiseToken,
    contracts.rewardEthToken,
    multipliers,
    durations
  );
  log(white(`Deployed SWISE Staking proxy contract: ${green(swiseStaking)}`));
  return { swiseStaking, ...contracts };
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
