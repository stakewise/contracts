const { white, green } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function deployProxy(contractName) {
  const ImplContract = await ethers.getContractFactory(contractName);
  const proxy = await upgrades.deployProxy(ImplContract, [], {
    initializer: false,
    kind: 'transparent',
  });
  await proxy.deployed();
  return proxy.address;
}

async function deployPoolEscrow() {
  const PoolEscrow = await ethers.getContractFactory('PoolEscrow');
  const escrow = await PoolEscrow.deploy(contractSettings.admin);

  await escrow.deployed();
  return escrow.address;
}

async function deployRoles() {
  const Roles = await ethers.getContractFactory('Roles');
  const proxy = await upgrades.deployProxy(Roles, [contractSettings.admin], {
    kind: 'transparent',
  });
  await proxy.deployed();
  return proxy.address;
}

async function deployContractChecker() {
  const ContractChecker = await ethers.getContractFactory('ContractChecker');
  const contractChecker = await ContractChecker.deploy();

  await contractChecker.deployed();
  return contractChecker.address;
}

async function initializePool(
  poolAddress,
  poolEscrowAddress,
  stakedTokenAddress,
  validatorsAddress,
  oraclesAddress,
  withdrawalCredentials = null
) {
  const Pool = await ethers.getContractFactory('Pool');
  if (!withdrawalCredentials) {
    withdrawalCredentials = ethers.utils.hexConcat([
      '0x01',
      '0x' + '00'.repeat(11),
      poolEscrowAddress,
    ]);
  }
  let pool = Pool.attach(poolAddress);

  // call initialize
  return pool.initialize(
    contractSettings.admin,
    withdrawalCredentials,
    contractSettings.validatorRegistration,
    stakedTokenAddress,
    validatorsAddress,
    oraclesAddress,
    contractSettings.minActivatingDeposit,
    contractSettings.pendingValidatorsLimit
  );
}

async function initializePoolValidators(
  poolValidatorsAddress,
  poolAddress,
  oraclesAddress
) {
  const PoolValidators = await ethers.getContractFactory('PoolValidators');
  let poolValidators = PoolValidators.attach(poolValidatorsAddress);

  // call initialize
  return poolValidators.initialize(
    contractSettings.admin,
    poolAddress,
    oraclesAddress
  );
}

async function initializeMerkleDistributor(
  merkleDistributorAddress,
  rewardTokenAddress,
  oraclesAddress
) {
  const MerkleDistributor = await ethers.getContractFactory(
    'MerkleDistributor'
  );

  let merkleDistributor = MerkleDistributor.attach(merkleDistributorAddress);

  // call initialize
  return merkleDistributor.initialize(
    contractSettings.admin,
    rewardTokenAddress,
    oraclesAddress
  );
}

async function initializeRewardToken(
  rewardTokenAddress,
  stakedTokenAddress,
  oraclesAddress,
  merkleDistributorAddress
) {
  const RewardToken = await ethers.getContractFactory('RewardToken');
  let rewardEthToken = RewardToken.attach(rewardTokenAddress);

  // call initialize
  return rewardEthToken.initialize(
    contractSettings.admin,
    stakedTokenAddress,
    oraclesAddress,
    contractSettings.protocolFeeRecipient,
    contractSettings.protocolFee,
    merkleDistributorAddress
  );
}

async function initializeStakedToken(
  stakedTokenAddress,
  poolAddress,
  rewardTokenAddress
) {
  const StakedToken = await ethers.getContractFactory('StakedToken');
  let stakedToken = StakedToken.attach(stakedTokenAddress);

  // call initialize
  return stakedToken.initialize(
    contractSettings.admin,
    poolAddress,
    rewardTokenAddress
  );
}

async function initializeOracles(
  oraclesAddress,
  rewardTokenAddress,
  poolAddress,
  poolValidatorsAddress,
  merkleDistributorAddress
) {
  const Oracles = await ethers.getContractFactory('Oracles');
  let oracles = Oracles.attach(oraclesAddress);

  // call initialize
  return oracles.initialize(
    contractSettings.admin,
    rewardTokenAddress,
    poolAddress,
    poolValidatorsAddress,
    merkleDistributorAddress
  );
}

async function deployContracts(withdrawalCredentials = null) {
  const poolEscrowAddress = await deployPoolEscrow();
  log(white(`Deployed Pool Escrow contract: ${green(poolEscrowAddress)}`));

  const contractCheckerAddress = await deployContractChecker();
  log(
    white(`Deployed ContractChecker contract: ${green(contractCheckerAddress)}`)
  );

  const rolesAddress = await deployRoles();
  log(`Deployed Roles contract: ${green(rolesAddress)}`);

  const poolAddress = await deployProxy('Pool');
  log(`Deployed Pool contract: ${green(poolAddress)}`);

  const poolValidatorsAddress = await deployProxy('PoolValidators');
  log(`Deployed PoolValidators contract: ${green(poolValidatorsAddress)}`);

  const rewardTokenAddress = await deployProxy('RewardToken');
  log(`Deployed RewardToken contract: ${green(rewardTokenAddress)}`);

  const stakedTokenAddress = await deployProxy('StakedToken');
  log(`Deployed StakedToken contract: ${green(stakedTokenAddress)}`);

  const merkleDistributorAddress = await deployProxy('MerkleDistributor');
  log(
    `Deployed MerkleDistributor contract: ${green(merkleDistributorAddress)}`
  );

  const oraclesAddress = await deployProxy('Oracles');
  log(`Deployed Oracles contract: ${green(oraclesAddress)}`);

  await initializeMerkleDistributor(
    merkleDistributorAddress,
    rewardTokenAddress,
    oraclesAddress
  );
  log(white('Initialized MerkleDistributor contract'));

  await initializePool(
    poolAddress,
    poolEscrowAddress,
    stakedTokenAddress,
    poolValidatorsAddress,
    oraclesAddress,
    withdrawalCredentials
  );
  log(white('Initialized Pool contract'));

  await initializePoolValidators(
    poolValidatorsAddress,
    poolAddress,
    oraclesAddress
  );
  log(white('Initialized PoolValidators contract'));

  await initializeRewardToken(
    rewardTokenAddress,
    stakedTokenAddress,
    oraclesAddress,
    merkleDistributorAddress
  );
  log(white('Initialized RewardToken contract'));

  await initializeStakedToken(
    stakedTokenAddress,
    poolAddress,
    rewardTokenAddress
  );
  log(white('Initialized StakedToken contract'));

  await initializeOracles(
    oraclesAddress,
    rewardTokenAddress,
    poolAddress,
    poolValidatorsAddress,
    merkleDistributorAddress
  );
  log(white('Initialized Oracles contract'));

  return {
    oracles: oraclesAddress,
    pool: poolAddress,
    poolValidators: poolValidatorsAddress,
    poolEscrow: poolEscrowAddress,
    stakedToken: stakedTokenAddress,
    rewardToken: rewardTokenAddress,
    merkleDistributor: merkleDistributorAddress,
    roles: rolesAddress,
    contractChecker: contractCheckerAddress,
  };
}

async function upgradeContracts(withdrawalCredentials = null) {
  return deployContracts(withdrawalCredentials);
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
