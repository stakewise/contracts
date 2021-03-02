const { ethers, upgrades, network } = require('hardhat');
const { calculateGasMargin } = require('./utils');

let provider = new ethers.providers.Web3Provider(network.provider);

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await upgrades.deployProxy(Validators, [], {
    initializer: false,
  });
  await proxy.deployed();
  return proxy.address;
}

async function initializeValidators(
  validatorsContractAddress,
  adminAddress,
  poolContractAddress,
  solosContractAddress
) {
  let Validators = await ethers.getContractFactory('Validators');
  Validators = Validators.attach(validatorsContractAddress);

  const { hash } = await Validators.estimateGas
    .initialize(adminAddress, poolContractAddress, solosContractAddress)
    .then((estimatedGas) =>
      Validators.initialize(
        adminAddress,
        poolContractAddress,
        solosContractAddress,
        {
          gasLimit: calculateGasMargin(estimatedGas),
        }
      )
    );
  return provider.waitForTransaction(hash);
}

async function deployOracles() {
  const Oracles = await ethers.getContractFactory('Oracles');
  const proxy = await upgrades.deployProxy(Oracles, [], {
    initializer: false,
  });
  await proxy.deployed();
  return proxy.address;
}

async function initializeOracles(
  oraclesContractAddress,
  adminAddress,
  rewardEthTokenContractAddress,
  oraclesSyncPeriod
) {
  let Oracles = await ethers.getContractFactory('Oracles');
  Oracles = Oracles.attach(oraclesContractAddress);

  const { hash } = await Oracles.initialize(
    adminAddress,
    rewardEthTokenContractAddress,
    oraclesSyncPeriod
  );
  return provider.waitForTransaction(hash);
}

async function prepareOraclesUpgrade(oraclesContractAddress) {
  const Oracles = await ethers.getContractFactory('Oracles');
  return upgrades.prepareUpgrade(oraclesContractAddress, Oracles);
}

async function prepareOraclesUpgradeData(
  poolContractAddress,
  depositsActivationEnabled
) {
  const Oracles = await ethers.getContractFactory('Oracles');
  return Oracles.interface.encodeFunctionData('upgrade', [
    poolContractAddress,
    depositsActivationEnabled,
  ]);
}

async function upgradeOracles(
  oraclesContractAddress,
  nextImplementation,
  data
) {
  const admin = await upgrades.admin.getInstance();
  const proxy = await admin.upgradeAndCall(
    oraclesContractAddress,
    nextImplementation,
    data
  );
  return proxy.address;
}

module.exports = {
  deployValidators,
  initializeValidators,
  deployOracles,
  initializeOracles,
  prepareOraclesUpgrade,
  prepareOraclesUpgradeData,
  upgradeOracles,
};
