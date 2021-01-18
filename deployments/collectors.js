const { ethers, upgrades, network } = require('hardhat');
const { calculateGasMargin } = require('./utils');
const { initialSettings } = require('./settings');

let provider = new ethers.providers.Web3Provider(network.provider);

async function deployPool() {
  const Pool = await ethers.getContractFactory('Pool');
  const proxy = await upgrades.deployProxy(Pool, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
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
  deploySolos,
};
