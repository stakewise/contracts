const { ethers } = require('@nomiclabs/buidler');
const { deployProxyWithoutInitialize } = require('./common');

async function deployPool() {
  const Pool = await ethers.getContractFactory('Pool');
  const proxy = await deployProxyWithoutInitialize(Pool, {
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializePool(
  poolContractAddress,
  swdTokenContractAddress,
  settingsContractAddress,
  operatorsContractAddress,
  vrcContractAddress,
  validatorsContractAddress
) {
  let Pool = await ethers.getContractFactory('Pool');
  Pool = Pool.attach(poolContractAddress);

  return Pool.initialize(
    swdTokenContractAddress,
    settingsContractAddress,
    operatorsContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
}

async function deploySolos() {
  const Solos = await ethers.getContractFactory('Solos');
  const proxy = await deployProxyWithoutInitialize(Solos, {
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeSolos(
  solosContractAddress,
  settingsContractAddress,
  operatorsContractAddress,
  vrcContractAddress,
  validatorsContractAddress
) {
  let Solos = await ethers.getContractFactory('Solos');
  Solos = Solos.attach(solosContractAddress);

  return Solos.initialize(
    settingsContractAddress,
    operatorsContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
}

module.exports = {
  deployPool,
  initializePool,
  deploySolos,
  initializeSolos,
};
