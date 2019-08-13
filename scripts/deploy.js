const { stdout } = require('@openzeppelin/cli');
const { Loggy } = require('@openzeppelin/upgrades');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { deployAllProxies } = require('../deployments');

stdout.silent(true);
Loggy.silent(true);

// TODO: Change to the actual value
const initialAdmin = '0xDD038cA29523F8872C641D585DFE493491c9bF13';
const VRC = '0x7f7423A398FB1b4C05F918eaE167d806929bfE7c';

(async () => {
  // Initialize network connection
  let networkConfig = await getNetworkConfig();

  // Deploy logic contracts
  await deployLogicContracts({ networkConfig });

  // Deploy all proxies
  await deployAllProxies({ initialAdmin, networkConfig, vrc: VRC });
})();
