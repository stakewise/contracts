const { ConfigManager, scripts } = require('@openzeppelin/cli');
const { ZWeb3 } = require('@openzeppelin/upgrades');
function log(message) {
  if (process.env.SILENT !== 'true') {
    console.log(message);
  }
}

async function getNetworkConfig({ network = 'development' } = {}) {
  let networkConfig = await ConfigManager.initNetworkConfiguration({
    network: process.env.NETWORK || network
  });

  log(`Initialized session on network "${networkConfig.network}"`);
  return networkConfig;
}

async function deployLogicContracts({ networkConfig }) {
  await scripts.push({
    deployProxyAdmin: true,
    ...networkConfig
  });
}

async function calculateContractAddress({ networkConfig }) {
  let salt = Math.round(Math.random() * 100000);
  let contractAddress = await scripts.queryDeployment({
    salt,
    ...networkConfig
  });
  while ((await ZWeb3.getCode(contractAddress)) !== '0x') {
    contractAddress = await scripts.queryDeployment({
      salt: Math.round(Math.random() * 100000),
      ...networkConfig
    });
  }

  return { salt, contractAddress };
}

module.exports = {
  log,
  getNetworkConfig,
  deployLogicContracts,
  calculateContractAddress
};
