const { ethers, upgrades, network } = require('hardhat');
const { calculateGasMargin } = require('./utils');

let provider = new ethers.providers.Web3Provider(network.provider);

async function deployValidators() {
  const Validators = await ethers.getContractFactory('Validators');
  const proxy = await upgrades.deployProxy(Validators, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
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
    unsafeAllowCustomTypes: true,
    initializer: false,
  });
  await proxy.deployed();
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

  const { hash } = await Oracles.initialize(
    adminAddress,
    rewardEthTokenContractAddress,
    totalRewardsUpdatePeriod
  );
  return provider.waitForTransaction(hash);
}

module.exports = {
  deployValidators,
  initializeValidators,
  deployOracles,
  initializeOracles,
};
