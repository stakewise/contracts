const hre = require('hardhat');
const {
  getProxyAdminFactory,
} = require('@openzeppelin/hardhat-upgrades/dist/proxy-factory');
const { white, green } = require('chalk');
const { contracts, contractSettings } = require('./settings');
const { prepareUpgrade } = require('./utils');
const { deployVestingEscrow } = require('./vestings');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  const VestingEscrowFactory = await hre.ethers.getContractFactory(
    'VestingEscrowFactory'
  );
  const vestingEscrowFactoryImpl = await prepareUpgrade(
    VestingEscrowFactory,
    contracts.vestingEscrowFactory
  );
  log(
    white(
      `Deployed VestingEscrowFactory implementation contract: ${green(
        vestingEscrowFactoryImpl
      )}`
    )
  );

  const vestingEscrowImpl = await deployVestingEscrow();
  log(
    white(
      `Deployed VestingEscrow implementation contract: ${green(
        vestingEscrowImpl
      )}`
    )
  );

  return {
    vestingEscrowFactoryImpl,
    vestingEscrowImpl,
  };
}

async function upgradeContracts() {
  const VestingEscrowFactory = await hre.ethers.getContractFactory(
    'VestingEscrowFactory'
  );
  const {
    vestingEscrowFactoryImpl,
    vestingEscrowImpl,
  } = await prepareContractsUpgrades();
  const signer = await hre.ethers.provider.getSigner(contractSettings.admin);
  const AdminFactory = await getProxyAdminFactory(hre);
  const proxyAdmin = AdminFactory.attach(contracts.proxyAdmin);
  await proxyAdmin
    .connect(signer)
    .upgrade(contracts.vestingEscrowFactory, vestingEscrowFactoryImpl);

  const vestingEscrowFactory = await VestingEscrowFactory.attach(
    contracts.vestingEscrowFactory
  );

  await vestingEscrowFactory.connect(signer).pause();
  await vestingEscrowFactory.connect(signer).upgrade(vestingEscrowImpl);
  await vestingEscrowFactory.connect(signer).unpause();
  log(white('Upgraded VestingEscrowFactory contract'));

  return contracts;
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
