const { ethers, upgrades } = require('hardhat');

async function deployPool() {
  const Pool = await ethers.getContractFactory('Pool');
  const proxy = await upgrades.deployProxy(Pool, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
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

  return Pool.initialize(
    adminAddress,
    stakedEthTokenContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
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
    validatorsContractAddress
  );

  await solos.deployed();
  return solos.address;
}

module.exports = {
  deployPool,
  initializePool,
  deploySolos,
};
