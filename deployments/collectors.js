const { ethers, upgrades, network } = require('hardhat');
const { calculateGasMargin } = require('./utils');
const { initialSettings } = require('./settings');

let provider = new ethers.providers.Web3Provider(network.provider);

async function deployPool() {
  const Pool = await ethers.getContractFactory('Pool');
  const proxy = await upgrades.deployProxy(Pool, [], {
    initializer: false,
  });
  await proxy.deployed();
  return proxy.address;
}

async function initializePool(
  poolContractAddress,
  adminAddress,
  stakedEthTokenContractAddress,
  vrcContractAddress,
  validatorsContractAddress
) {
  let Pool = await ethers.getContractFactory('Pool');
  Pool = Pool.attach(poolContractAddress);

  const { hash } = await Pool.estimateGas
    .initialize(
      adminAddress,
      stakedEthTokenContractAddress,
      vrcContractAddress,
      validatorsContractAddress,
      initialSettings.withdrawalCredentials
    )
    .then((estimatedGas) =>
      Pool.initialize(
        adminAddress,
        stakedEthTokenContractAddress,
        vrcContractAddress,
        validatorsContractAddress,
        initialSettings.withdrawalCredentials,
        {
          gasLimit: calculateGasMargin(estimatedGas),
        }
      )
    );
  return provider.waitForTransaction(hash);
}

async function preparePoolUpgrade(poolContractAddress) {
  const Pool = await ethers.getContractFactory('Pool');
  return upgrades.prepareUpgrade(poolContractAddress, Pool);
}

async function preparePoolUpgradeData(
  oraclesContractAddress,
  activationDuration,
  beaconActivatingAmount,
  minActivatingDeposit,
  minActivatingShare
) {
  const Pool = await ethers.getContractFactory('Pool');
  return Pool.interface.encodeFunctionData('upgrade', [
    oraclesContractAddress,
    activationDuration,
    beaconActivatingAmount,
    minActivatingDeposit,
    minActivatingShare,
  ]);
}

async function upgradePool(poolContractAddress, nextImplementation, data) {
  const admin = await upgrades.admin.getInstance();
  const proxy = await admin.upgradeAndCall(
    poolContractAddress,
    nextImplementation,
    data
  );
  return proxy.address;
}

async function deploySolos(
  adminAddress,
  vrcContractAddress,
  validatorsContractAddress
) {
  // Solos is deployed without proxy as it's non-custodial
  const Solos = await ethers.getContractFactory('Solos');
  const solos = await Solos.deploy(
    adminAddress,
    vrcContractAddress,
    validatorsContractAddress,
    initialSettings.validatorPrice,
    initialSettings.cancelLockDuration
  );

  await solos.deployed();
  return solos.address;
}

module.exports = {
  deployPool,
  initializePool,
  upgradePool,
  preparePoolUpgrade,
  preparePoolUpgradeData,
  deploySolos,
};
