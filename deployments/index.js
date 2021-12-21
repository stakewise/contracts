const { white } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradeMerkleDistributor(oraclesContractAddress) {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const MerkleDistributor = await ethers.getContractFactory(
    'MerkleDistributor',
    signer
  );
  let merkleDistributor = MerkleDistributor.attach(contracts.merkleDistributor);

  // pause
  if (!(await merkleDistributor.paused())) {
    await merkleDistributor.pause();
  }

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
  if (!(await pool.paused())) {
    await pool.pause();
  }

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
  if (!(await rewardEthToken.paused())) {
    await rewardEthToken.pause();
  }

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
  return contracts;
}

async function upgradeContracts() {
  const { poolValidators, oracles } = await deployContracts();

  await upgradeMerkleDistributor(oracles);
  log(white('Upgraded MerkleDistributor contract'));

  await upgradePool(poolValidators, oracles);
  log(white('Upgraded Pool contract'));

  await upgradeRewardEthToken(oracles);
  log(white('Upgraded RewardEthToken contract'));

  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
