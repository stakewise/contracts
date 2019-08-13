const { ConfigManager, scripts } = require('@openzeppelin/cli');

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

function getSalt({ excluded = [] } = {}) {
  let salt = Math.round(Math.random() * 100000);
  while (excluded.includes(salt)) {
    salt = Math.round(Math.random() * 100000);
  }
  return salt;
}

module.exports.getSalt = getSalt;
module.exports.getNetworkConfig = getNetworkConfig;
module.exports.getNetworkConfig = getNetworkConfig;
module.exports.deployLogicContracts = deployLogicContracts;
module.exports.log = log;
