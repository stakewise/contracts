const { ethers, upgrades } = require('@nomiclabs/buidler');

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await upgrades.deployProxy(Validators, [], {
    initializer: false,
  });
  return proxy.address;
}

async function initializeValidators(
  validatorsContractAddress,
  poolContractAddress,
  solosContractAddress,
  settingsContractAddress
) {
  let Validators = await ethers.getContractFactory('Validators');
  Validators = Validators.attach(validatorsContractAddress);

  return Validators.initialize(
    poolContractAddress,
    solosContractAddress,
    settingsContractAddress
  );
}

module.exports = {
  deployValidators,
  initializeValidators,
};
