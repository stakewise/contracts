const { white, green } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function deployPoolValidators() {
  const PoolValidators = await ethers.getContractFactory('PoolValidators');
  const proxy = await upgrades.deployProxy(PoolValidators, [], {
    initializer: false,
    kind: 'transparent',
  });
  await proxy.deployed();
  return proxy.address;
}

async function initializePoolValidators(
  poolValidatorsContractAddress,
  oraclesContractAddress
) {
  const PoolValidators = await ethers.getContractFactory('PoolValidators');
  let poolValidators = PoolValidators.attach(poolValidatorsContractAddress);

  // call initialize
  return poolValidators.initialize(
    contractSettings.admin,
    contracts.pool,
    oraclesContractAddress
  );
}

async function deployAndInitializeOracles(poolValidatorsContractAddress) {
  const Oracles = await ethers.getContractFactory('Oracles');
  const proxy = await upgrades.deployProxy(
    Oracles,
    [
      contractSettings.admin,
      contracts.oracles,
      contracts.rewardEthToken,
      contracts.pool,
      poolValidatorsContractAddress,
      contracts.merkleDistributor,
    ],
    {
      kind: 'transparent',
    }
  );
  await proxy.deployed();
  return proxy.address;
}

async function deployAndInitializeRoles() {
  const Roles = await ethers.getContractFactory('Roles');
  const proxy = await upgrades.deployProxy(Roles, [contractSettings.admin], {
    kind: 'transparent',
  });
  await proxy.deployed();
  return proxy.address;
}

async function upgradeMerkleDistributor(oraclesContractAddress) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const MerkleDistributor = await ethers.getContractFactory(
    'MerkleDistributor',
    signer
  );
  let merkleDistributor = MerkleDistributor.attach(contracts.merkleDistributor);

  // pause
  await merkleDistributor.pause();

  // upgrade MerkleDistributor to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.merkleDistributor,
    MerkleDistributor
  );
  await proxy.deployed();

  // call upgrade
  await merkleDistributor.upgrade(oraclesContractAddress);

  // unpause
  return merkleDistributor.connect(signer).unpause();
}

async function upgradePool(
  poolValidatorsContractAddress,
  oraclesContractAddress
) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const Pool = await ethers.getContractFactory('Pool', signer);
  let pool = await Pool.attach(contracts.pool);

  // pause
  await pool.pause();

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.pool, Pool);
  await proxy.deployed();

  // call upgrade
  await pool.upgrade(poolValidatorsContractAddress, oraclesContractAddress);

  // unpause
  return pool.unpause();
}

async function upgradeRewardEthToken(oraclesContractAddress) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const RewardEthToken = await ethers.getContractFactory(
    'RewardEthToken',
    signer
  );
  let rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);

  // pause
  await rewardEthToken.pause();

  // upgrade RewardEthToken to new implementation
  const proxy = await upgrades.upgradeProxy(
    contracts.rewardEthToken,
    RewardEthToken,
    {
      unsafeAllowRenames: true,
    }
  );
  await proxy.deployed();

  // call upgrade
  await rewardEthToken.upgrade(oraclesContractAddress);

  return rewardEthToken.unpause();
}

async function deployContracts() {
  const poolValidators = await deployPoolValidators();
  log(white(`Deployed Pool Validators contract: ${green(poolValidators)}`));

  const oracles = await deployAndInitializeOracles(poolValidators);
  log(white(`Deployed Oracles contract: ${green(oracles)}`));

  await initializePoolValidators(poolValidators, oracles);
  log(white('Initialized Pool Validators contract'));

  const roles = await deployAndInitializeRoles();
  log(white(`Deployed and initialized Roles contract: ${green(roles)}`));

  return {
    poolValidators,
    oracles,
    roles,
  };
}

async function upgradeContracts() {
  const { poolValidators, oracles, roles } = await deployContracts();

  await upgradeMerkleDistributor(oracles);
  log(white('Upgraded MerkleDistributor contract'));

  await upgradePool(poolValidators, oracles);
  log(white('Upgraded Pool contract'));

  await upgradeRewardEthToken(oracles);
  log(white('Upgraded RewardEthToken contract'));

  return {
    ...contracts,
    poolValidators,
    oracles,
    roles,
  };
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
