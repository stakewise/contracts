const hre = require('hardhat');
const {
  getProxyAdminFactory,
} = require('@openzeppelin/hardhat-upgrades/dist/utils');
const { white, green } = require('chalk');
const { contracts, contractSettings } = require('./settings');
const { deployAnInitializeMerkleDistributor } = require('./merkleDistributor');
const { prepareUpgrade } = require('./utils');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function prepareContractsUpgrades() {
  const RewardEthToken = await hre.ethers.getContractFactory('RewardEthToken');
  const rewardEthTokenImpl = await prepareUpgrade(
    RewardEthToken,
    contracts.rewardEthToken,
    {},
    true
  );
  log(
    white(
      `Deployed RewardEthToken implementation contract: ${green(
        rewardEthTokenImpl
      )}`
    )
  );

  const StakedEthToken = await hre.ethers.getContractFactory('StakedEthToken');
  const stakedEthTokenImpl = await prepareUpgrade(
    StakedEthToken,
    contracts.stakedEthToken,
    {},
    true
  );
  log(
    white(
      `Deployed StakedEthToken implementation contract: ${green(
        stakedEthTokenImpl
      )}`
    )
  );

  const Oracles = await hre.ethers.getContractFactory('Oracles');
  const oraclesImpl = await prepareUpgrade(Oracles, contracts.oracles);
  log(white(`Deployed Oracles implementation contract: ${green(oraclesImpl)}`));

  return {
    rewardEthTokenImpl,
    stakedEthTokenImpl,
    oraclesImpl,
  };
}

async function upgradeContracts() {
  const merkleDistributor = await deployAnInitializeMerkleDistributor(
    contractSettings.admin,
    contracts.rewardEthToken,
    contracts.oracles
  );
  log(
    white(
      `Deployed Merkle Distributor proxy contract: ${green(merkleDistributor)}`
    )
  );

  const {
    rewardEthTokenImpl,
    stakedEthTokenImpl,
    oraclesImpl,
  } = await prepareContractsUpgrades();
  const signer = await hre.ethers.provider.getSigner(contractSettings.admin);
  const AdminFactory = await getProxyAdminFactory(hre);
  const proxyAdmin = AdminFactory.attach(contracts.proxyAdmin);

  // upgrade RewardEthToken to new implementation
  await proxyAdmin
    .connect(signer)
    .upgrade(contracts.rewardEthToken, rewardEthTokenImpl);

  // upgrade StakedEthToken to new implementation
  await proxyAdmin
    .connect(signer)
    .upgrade(contracts.stakedEthToken, stakedEthTokenImpl);

  // upgrade Oracles to new implementation
  await proxyAdmin.connect(signer).upgrade(contracts.oracles, oraclesImpl);

  // call upgrade function of RewardEthToken
  const RewardEthToken = await hre.ethers.getContractFactory('RewardEthToken');
  const rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);
  await rewardEthToken.connect(signer).pause();
  await rewardEthToken
    .connect(signer)
    .upgrade(
      merkleDistributor,
      contractSettings.totalRewardsLastUpdateBlockNumber
    );
  await rewardEthToken.connect(signer).unpause();
  log(white('Upgraded RewardEthToken contract'));

  // call upgrade function of Oracles
  const Oracles = await hre.ethers.getContractFactory('Oracles');
  const oracles = await Oracles.attach(contracts.oracles);
  await oracles.connect(signer).pause();
  await oracles
    .connect(signer)
    .upgrade(merkleDistributor, contractSettings.syncPeriod);
  await oracles.connect(signer).unpause();
  log(white('Upgraded Oracles contract'));

  return {
    merkleDistributor,
    ...contracts,
  };
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
