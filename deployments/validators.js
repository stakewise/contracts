const { ethers } = require('@nomiclabs/buidler');
const { deployProxyWithoutInitialize } = require('./common');

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await deployProxyWithoutInitialize(Validators);
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
