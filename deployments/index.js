const { white, green } = require('chalk');
const { ethers, upgrades, config } = require('hardhat');
const { contracts, contractSettings } = require('./settings');

function log(message) {
  if (config != null && config.suppressLogs !== true) {
    console.log(message);
  }
}

async function upgradePool() {
  const signer = await ethers.provider.getSigner(contractSettings.admin);
  const Pool = await ethers.getContractFactory('Pool', signer);

  // upgrade Pool to new implementation
  const proxy = await upgrades.upgradeProxy(contracts.pool, Pool);
  await proxy.deployed();
}

async function upgradeRewardEthToken(feesEscrowContractAddress) {
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
    RewardEthToken
  );
  await proxy.deployed();

  // call upgrade
  await rewardEthToken.upgrade(feesEscrowContractAddress);

  return rewardEthToken.unpause();
}

async function deployContracts() {
  const FeesEscrow = await ethers.getContractFactory('FeesEscrow');
  const feesEscrow = await FeesEscrow.deploy(
    contracts.pool,
    contracts.rewardEthToken
  );
  log(white(`Deployed FeesEscrow contract: ${green(feesEscrow.address)}`));

  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  const rewardEthToken = await upgrades.prepareUpgrade(
    contracts.rewardEthToken,
    RewardEthToken
  );
  log(
    white(
      `Deployed RewardEthToken implementation contract: ${green(
        rewardEthToken
      )}`
    )
  );

  const Pool = await ethers.getContractFactory('Pool');
  const pool = await upgrades.prepareUpgrade(contracts.pool, Pool);
  log(white(`Deployed Pool implementation contract: ${green(pool)}`));

  return { feesEscrow: feesEscrow.address, rewardEthToken, pool };
}

async function upgradeContracts() {
  const { feesEscrow } = await deployContracts();

  await upgradePool();
  log(white('Upgraded Pool contract'));
  await upgradeRewardEthToken(feesEscrow);
  log(white('Upgraded RewardEthToken contract'));

  return {
    ...contracts,
    feesEscrow: feesEscrow,
  };
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
