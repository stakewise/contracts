const { stdout } = require('@openzeppelin/cli');
const { Loggy } = require('@openzeppelin/upgrades');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { deployAllProxies } = require('../deployments');

stdout.silent(true);
Loggy.silent(true);

(async () => {
  // Initialize network connection
  let networkConfig = await getNetworkConfig();

  // Deploy logic contracts
  await deployLogicContracts({ networkConfig });

  // Deploy all proxies
  await deployAllProxies({
    initialAdmin: process.env.INITIAL_ADMIN,
    transfersManager: process.env.TRANSFERS_MANAGER,
    vrc: process.env.VRC,
    networkConfig
  });
})();
