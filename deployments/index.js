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

async function deployWhiteListManager() {
  const WhiteListManager = await ethers.getContractFactory('WhiteListManager');
  const proxy = await upgrades.deployProxy(
    WhiteListManager,
    [contractSettings.admin],
    {
      kind: 'transparent',
    }
  );
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
  stakedEthTokenAddress,
  validatorsAddress,
  oraclesAddress,
  whiteListManagerAddress,
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
    stakedEthTokenAddress,
    validatorsAddress,
    oraclesAddress,
    whiteListManagerAddress,
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
  rewardEthTokenAddress,
  oraclesAddress
) {
  const MerkleDistributor = await ethers.getContractFactory(
    'MerkleDistributor'
  );

  let merkleDistributor = MerkleDistributor.attach(merkleDistributorAddress);

  // call initialize
  return merkleDistributor.initialize(
    contractSettings.admin,
    rewardEthTokenAddress,
    oraclesAddress
  );
}

async function initializeRewardEthToken(
  rewardEthTokenAddress,
  stakedEthTokenAddress,
  oraclesAddress,
  merkleDistributorAddress,
  whiteListManagerAddress
) {
  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  let rewardEthToken = RewardEthToken.attach(rewardEthTokenAddress);

  // call initialize
  return rewardEthToken.initialize(
    contractSettings.admin,
    stakedEthTokenAddress,
    oraclesAddress,
    contractSettings.protocolFeeRecipient,
    contractSettings.protocolFee,
    merkleDistributorAddress,
    whiteListManagerAddress
  );
}

async function initializeStakedEthToken(
  stakedEthTokenAddress,
  poolAddress,
  rewardEthTokenAddress,
  whiteListManagerAddress
) {
  const StakedEthToken = await ethers.getContractFactory('StakedEthToken');
  let stakedEthToken = StakedEthToken.attach(stakedEthTokenAddress);

  // call initialize
  return stakedEthToken.initialize(
    contractSettings.admin,
    poolAddress,
    rewardEthTokenAddress,
    whiteListManagerAddress
  );
}

async function initializeOracles(
  oraclesAddress,
  rewardEthTokenAddress,
  poolAddress,
  poolValidatorsAddress,
  merkleDistributorAddress
) {
  const Oracles = await ethers.getContractFactory('Oracles');
  let oracles = Oracles.attach(oraclesAddress);

  // call initialize
  return oracles.initialize(
    contractSettings.admin,
    rewardEthTokenAddress,
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

  const whiteListManagerAddress = await deployWhiteListManager();
  log(
    white(
      `Deployed WhiteListManager contract: ${green(whiteListManagerAddress)}`
    )
  );

  const rolesAddress = await deployRoles();
  log(`Deployed Roles contract: ${green(rolesAddress)}`);

  const poolAddress = await deployProxy('Pool');
  log(`Deployed Pool contract: ${green(poolAddress)}`);

  const poolValidatorsAddress = await deployProxy('PoolValidators');
  log(`Deployed PoolValidators contract: ${green(poolValidatorsAddress)}`);

  const rewardEthTokenAddress = await deployProxy('RewardEthToken');
  log(`Deployed RewardEthToken contract: ${green(rewardEthTokenAddress)}`);

  const stakedEthTokenAddress = await deployProxy('StakedEthToken');
  log(`Deployed StakedEthToken contract: ${green(stakedEthTokenAddress)}`);

  const merkleDistributorAddress = await deployProxy('MerkleDistributor');
  log(
    `Deployed MerkleDistributor contract: ${green(merkleDistributorAddress)}`
  );

  const oraclesAddress = await deployProxy('Oracles');
  log(`Deployed Oracles contract: ${green(oraclesAddress)}`);

  await initializeMerkleDistributor(
    merkleDistributorAddress,
    rewardEthTokenAddress,
    oraclesAddress
  );
  log(white('Initialized MerkleDistributor contract'));

  await initializePool(
    poolAddress,
    poolEscrowAddress,
    stakedEthTokenAddress,
    poolValidatorsAddress,
    oraclesAddress,
    whiteListManagerAddress,
    withdrawalCredentials
  );
  log(white('Initialized Pool contract'));

  await initializePoolValidators(
    poolValidatorsAddress,
    poolAddress,
    oraclesAddress
  );
  log(white('Initialized PoolValidators contract'));

  await initializeRewardEthToken(
    rewardEthTokenAddress,
    stakedEthTokenAddress,
    oraclesAddress,
    merkleDistributorAddress,
    whiteListManagerAddress
  );
  log(white('Initialized RewardEthToken contract'));

  await initializeStakedEthToken(
    stakedEthTokenAddress,
    poolAddress,
    rewardEthTokenAddress,
    whiteListManagerAddress
  );
  log(white('Initialized StakedEthToken contract'));

  await initializeOracles(
    oraclesAddress,
    rewardEthTokenAddress,
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
    stakedEthToken: stakedEthTokenAddress,
    rewardEthToken: rewardEthTokenAddress,
    merkleDistributor: merkleDistributorAddress,
    roles: rolesAddress,
    contractChecker: contractCheckerAddress,
    whiteListManager: whiteListManagerAddress,
  };
}

async function upgradeContracts(withdrawalCredentials = null) {
  return deployContracts(withdrawalCredentials);
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
