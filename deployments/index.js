const { scripts } = require('@openzeppelin/cli');
const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployWalletsManagersProxy
} = require('../deployments/access');
const { getSalt } = require('../deployments/common');
const { deployDepositsProxy } = require('../deployments/deposits');
const { deployPoolsProxy } = require('../deployments/collectors');
const { deploySettingsProxy } = require('../deployments/settings');
const {
  deployWalletsRegistryProxy,
  deployWithdrawalsProxy
} = require('../deployments/withdrawals');
const {
  deployValidatorsRegistry
} = require('../deployments/validatorsRegistry');

async function deployAllProxies({ initialAdmin, networkConfig, vrc }) {
  // Deploy admins, operators, managers proxies
  let adminsProxy = await deployAdminsProxy({
    networkConfig,
    initialAdmin
  });
  let operatorsProxy = await deployOperatorsProxy({
    networkConfig,
    adminsProxy
  });
  let walletsManagersProxy = await deployWalletsManagersProxy({
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

  // Calculate Wallets Registry proxy addresses via create2
  let walletsRegistrySalt = getSalt({
    excluded: [depositsSalt, validatorsRegistrySalt, poolsSalt]
  });
  let walletsRegistryCalcProxy = await scripts.queryDeployment({
    salt: walletsRegistrySalt,
    ...networkConfig
  });

  // Calculate Withdrawals proxy addresses via create2
  let withdrawalsSalt = getSalt({
    excluded: [
      depositsSalt,
      validatorsRegistrySalt,
      poolsSalt,
      walletsRegistrySalt
    ]
  });
  let withdrawalsCalcProxy = await scripts.queryDeployment({
    salt: withdrawalsSalt,
    ...networkConfig
  });

  // Deploy Wallets Registry proxy
  let walletsRegistryProxy = await deployWalletsRegistryProxy({
    withdrawalsProxy: withdrawalsCalcProxy,
    salt: walletsRegistrySalt,
    validatorsRegistryProxy,
    networkConfig,
    adminsProxy,
    walletsManagersProxy
  });
  if (walletsRegistryProxy !== walletsRegistryCalcProxy) {
    throw new Error(
      `Wallets Registry contract actual address "${walletsRegistryProxy} does not match expected "${walletsRegistryCalcProxy}"`
    );
  }

  // Deploy Withdrawals proxy
  let withdrawalsProxy = await deployWithdrawalsProxy({
    salt: withdrawalsSalt,
    walletsManagersProxy,
    depositsProxy,
    settingsProxy,
    networkConfig,
    walletsRegistryProxy,
    validatorsRegistryProxy
  });
  if (withdrawalsProxy !== withdrawalsCalcProxy) {
    throw new Error(
      `Withdrawals contract actual address "${withdrawalsProxy}" does not match expected "${withdrawalsCalcProxy}"`
    );
  }

  return {
    admins: adminsProxy,
    operators: operatorsProxy,
    walletsManagers: walletsManagersProxy,
    settings: settingsProxy,
    deposits: depositsProxy,
    validatorsRegistry: validatorsRegistryProxy,
    pools: poolsProxy,
    walletsRegistry: walletsRegistryProxy,
    withdrawals: withdrawalsProxy
  };
}

module.exports = {
  deployAllProxies
};
