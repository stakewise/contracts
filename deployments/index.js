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
  log(
    white(
      `Upgraded RewardEthToken contract implementation to ${rewardEthTokenImpl}`
    )
  );

  // upgrade StakedEthToken to new implementation
  await proxyAdmin
    .connect(signer)
    .upgrade(contracts.stakedEthToken, stakedEthTokenImpl);
  log(
    white(
      `Upgraded StakedEthToken contract implementation to ${stakedEthTokenImpl}`
    )
  );

  // upgrade Oracles to new implementation
  await proxyAdmin.connect(signer).upgrade(contracts.oracles, oraclesImpl);
  log(white(`Upgraded Oracles contract implementation to ${oraclesImpl}`));

  // call upgrade function of RewardEthToken
  const RewardEthToken = await hre.ethers.getContractFactory('RewardEthToken');
  const rewardEthToken = await RewardEthToken.attach(contracts.rewardEthToken);
  await rewardEthToken.connect(signer).pause();
  log(white('Paused RewardEthToken contract'));
  await rewardEthToken
    .connect(signer)
    .upgrade(
      merkleDistributor,
      contractSettings.totalRewardsLastUpdateBlockNumber
    );
  log(white('Initialized RewardEthToken contract'));
  await rewardEthToken.connect(signer).unpause();
  log(white('Unpaused RewardEthToken contract'));

  // call upgrade function of Oracles
  const Oracles = await hre.ethers.getContractFactory('Oracles');
  const oracles = await Oracles.attach(contracts.oracles);
  await oracles.connect(signer).pause();
  log(white('Paused Oracles contract'));
  await oracles
    .connect(signer)
    .upgrade(merkleDistributor, contractSettings.syncPeriod);
  log(white('Initialized Oracles contract'));
  await oracles.connect(signer).unpause();
  log(white('Unpaused Oracles contract'));

  return {
    merkleDistributor,
    ...contracts,
  };
}

module.exports = {
  prepareContractsUpgrades,
  upgradeContracts,
};
