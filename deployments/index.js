const hre = require('hardhat');
const { white, green } = require('chalk');
const { contractSettings, contracts } = require('./settings');
const { prepareOraclesUpgradeData, upgradeOracles } = require('./validators');
const { preparePoolUpgradeData, upgradePool } = require('./collectors');
const { prepareUpgrade } = require('./utils');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  const Pool = await hre.ethers.getContractFactory('Pool');
  const poolImplementation = await prepareUpgrade(Pool, contracts.pool);
  log(
    white(`Deployed Pool implementation contract: ${green(poolImplementation)}`)
  );

  const poolUpgradeData = await preparePoolUpgradeData(
    contracts.oracles,
    contractSettings.activationDuration,
    contractSettings.totalStakingAmount,
    contractSettings.minActivatingDeposit,
    contractSettings.minActivatingShare
  );
  log(white(`Pool upgrade data: ${green(poolUpgradeData)}`));

  const Oracles = await hre.ethers.getContractFactory('Oracles');
  const oraclesImplementation = await prepareUpgrade(
    Oracles,
    contracts.oracles
  );
  log(
    white(
      `Deployed Oracles implementation contract: ${green(
        oraclesImplementation
      )}`
    )
  );

  const oraclesUpgradeData = await prepareOraclesUpgradeData(
    contracts.pool,
    contractSettings.depositsActivationEnabled
  );
  log(white(`Oracles upgrade data: ${green(oraclesUpgradeData)}`));

  return {
    poolImplementation,
    poolUpgradeData,
    oraclesImplementation,
    oraclesUpgradeData,
  };
}

async function upgradeContracts() {
  let preparedUpgrades = await prepareContractsUpgrades();
  const signer = await hre.ethers.provider.getSigner(contractSettings.admin);

  const Pool = await hre.ethers.getContractFactory('Pool');
  let pool = Pool.attach(contracts.pool);
  await pool.connect(signer).pause();
  await pool.connect(signer).addAdmin(contracts.proxyAdmin);

  const Oracles = await hre.ethers.getContractFactory('Oracles');
  let oracles = Oracles.attach(contracts.oracles);
  await oracles.connect(signer).pause();
  await oracles.connect(signer).addAdmin(contracts.proxyAdmin);

  await upgradePool(
    contractSettings.admin,
    contracts.proxyAdmin,
    contracts.pool,
    preparedUpgrades.poolImplementation,
    preparedUpgrades.poolUpgradeData
  );
  log(white('Upgraded Pool contract'));

  await upgradeOracles(
    contractSettings.admin,
    contracts.proxyAdmin,
    contracts.oracles,
    preparedUpgrades.oraclesImplementation,
    preparedUpgrades.oraclesUpgradeData
  );
  log(white('Upgraded Oracles contract'));

  await pool.connect(signer).unpause();
  await oracles.connect(signer).unpause();
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
