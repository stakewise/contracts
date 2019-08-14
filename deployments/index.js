const { scripts } = require('@openzeppelin/cli');
const {
  deployAdminsProxy,
  deployOperatorsProxy
} = require('../deployments/access');
const { getSalt } = require('../deployments/common');
const { deployDepositsProxy } = require('../deployments/deposits');
const { deployPoolsProxy } = require('../deployments/collectors');
const { deploySettingsProxy } = require('../deployments/settings');
const {
  deployValidatorsRegistry
} = require('../deployments/validatorsRegistry');

async function deployAllProxies({ initialAdmin, networkConfig, vrc }) {
  // Deploy admins and operators proxies
  let adminsProxy = await deployAdminsProxy({
    networkConfig,
    initialAdmin
  });
  let operatorsProxy = await deployOperatorsProxy({
    networkConfig,
    adminsProxy
  });

  // Deploy global settings
  let settingsProxy = await deploySettingsProxy({ networkConfig, adminsProxy });

  // Calculate Deposits proxy addresses via create2
  let depositsSalt = getSalt();
  let depositsCalcProxy = await scripts.queryDeployment({
    salt: depositsSalt,
    ...networkConfig
  });

  // Calculate Validators Registry proxy addresses via create2
  let validatorsRegistrySalt = getSalt({ excluded: [depositsSalt] });
  let validatorsRegistryCalcProxy = await scripts.queryDeployment({
    salt: validatorsRegistrySalt,
    ...networkConfig
  });

  // Calculate Pools proxy addresses via create2
  let poolsSalt = getSalt({ excluded: [depositsSalt, validatorsRegistrySalt] });
  let poolsCalcProxy = await scripts.queryDeployment({
    salt: poolsSalt,
    ...networkConfig
  });

  // Deploy Deposits proxy
  let depositsProxy = await deployDepositsProxy({
    poolsProxy: poolsCalcProxy,
    salt: depositsSalt,
    networkConfig
  });
  if (depositsProxy !== depositsCalcProxy) {
    throw new Error(
      `Deposits contract actual address "${depositsProxy}" does not match expected "${depositsCalcProxy}"`
    );
  }

  // Deploy Validators Registry proxy
  let validatorsRegistryProxy = await deployValidatorsRegistry({
    poolsProxy: poolsCalcProxy,
    salt: validatorsRegistrySalt,
    settingsProxy,
    networkConfig
  });
  if (validatorsRegistryProxy !== validatorsRegistryCalcProxy) {
    throw new Error(
      `Validators Registry contract actual address "${validatorsRegistryProxy}" does not match expected "${validatorsRegistryCalcProxy}"`
    );
  }

  // Deploy Pools proxy
  let poolsProxy = await deployPoolsProxy({
    vrc,
    salt: poolsSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    networkConfig
  });
  if (poolsProxy !== poolsCalcProxy) {
    throw new Error(
      `Pools contract actual address "${poolsProxy}" does not match expected "${poolsCalcProxy}"`
    );
  }

  return {
    admins: adminsProxy,
    operators: operatorsProxy,
    settings: settingsProxy,
    deposits: depositsProxy,
    validatorsRegistry: validatorsRegistryProxy,
    pools: poolsProxy
  };
}

module.exports = {
  deployAllProxies
};
