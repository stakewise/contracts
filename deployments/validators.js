const { ethers, upgrades } = require('hardhat');

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await upgrades.deployProxy(Validators, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
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

async function deployOracles() {
  const Oracles = await ethers.getContractFactory('Oracles');
  const proxy = await upgrades.deployProxy(Oracles, [], {
    unsafeAllowCustomTypes: true,
    initializer: false,
  });
  return proxy.address;
}

async function initializeOracles(
  oraclesContractAddress,
  adminAddress,
  rewardEthTokenContractAddress,
  totalRewardsUpdatePeriod
) {
  let Oracles = await ethers.getContractFactory('Oracles');
  Oracles = Oracles.attach(oraclesContractAddress);

  return Oracles.initialize(
    adminAddress,
    rewardEthTokenContractAddress,
    totalRewardsUpdatePeriod
  );
}

module.exports = {
  deployValidators,
  initializeValidators,
  deployOracles,
  initializeOracles,
};
