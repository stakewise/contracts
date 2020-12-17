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

async function deployBalanceReporters() {
  const BalanceReporters = await ethers.getContractFactory('BalanceReporters');
  const proxy = await upgrades.deployProxy(BalanceReporters, [], {
    unsafeAllowCustomTypes: true,
    initializer: false,
  });
  return proxy.address;
}

async function initializeBalanceReporters(
  balanceReportersContractAddress,
  adminAddress,
  rewardEthTokenContractAddress
) {
  let BalanceReporters = await ethers.getContractFactory('BalanceReporters');
  BalanceReporters = BalanceReporters.attach(balanceReportersContractAddress);

  return BalanceReporters.initialize(
    adminAddress,
    rewardEthTokenContractAddress
  );
}

module.exports = {
  deployValidators,
  initializeValidators,
  deployBalanceReporters,
  initializeBalanceReporters,
};
