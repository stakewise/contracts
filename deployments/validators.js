const { ethers, upgrades } = require('hardhat');

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await upgrades.deployProxy(Validators, [], {
    initializer: false,
  });
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

  return Validators.initialize(
    adminAddress,
    poolContractAddress,
    solosContractAddress
  );
}

module.exports = {
  deployValidators,
  initializeValidators,
};
