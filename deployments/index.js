const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployWalletsManagersProxy
} = require('../deployments/access');
const { calculateContractAddress } = require('../deployments/common');
const { deployDepositsProxy } = require('../deployments/deposits');
const {
  deployPoolsProxy,
  deployPrivatesProxy
} = require('../deployments/collectors');
const { deploySettingsProxy } = require('../deployments/settings');
const {
  deployWalletsRegistryProxy,
  deployWithdrawalsProxy
} = require('../deployments/withdrawals');
const {
  deployValidatorsRegistryProxy
} = require('../deployments/validatorsRegistry');
const {
  deployValidatorTransfersProxy
} = require('../deployments/validatorTransfers');

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
  let settingsProxy = await deploySettingsProxy({
    networkConfig,
    adminsProxy,
    operatorsProxy
  });

  // Calculate Deposits proxy address via create2
  let {
    salt: depositsSalt,
    contractAddress: depositsCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Calculate Validators Registry proxy address via create2
  let {
    salt: validatorsRegistrySalt,
    contractAddress: validatorsRegistryCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Calculate Pools proxy address via create2
  let {
    salt: poolsSalt,
    contractAddress: poolsCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Calculate Privates proxy address via create2
  let {
    salt: privatesSalt,
    contractAddress: privatesCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Calculate Validator Transfers proxy address via create2
  let {
    salt: validatorTransfersSalt,
    contractAddress: validatorTransfersCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Deploy Deposits proxy
  let depositsProxy = await deployDepositsProxy({
    poolsProxy: poolsCalcProxy,
    privatesProxy: privatesCalcProxy,
    salt: depositsSalt,
    networkConfig
  });
  if (depositsProxy !== depositsCalcProxy) {
    throw new Error(
      `Deposits contract actual address "${depositsProxy}" does not match expected "${depositsCalcProxy}"`
    );
  }

  // Deploy Validators Registry proxy
  let validatorsRegistryProxy = await deployValidatorsRegistryProxy({
    poolsProxy: poolsCalcProxy,
    privatesProxy: privatesCalcProxy,
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
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig
  });
  if (poolsProxy !== poolsCalcProxy) {
    throw new Error(
      `Pools contract actual address "${poolsProxy}" does not match expected "${poolsCalcProxy}"`
    );
  }

  // Deploy Privates proxy
  let privatesProxy = await deployPrivatesProxy({
    vrc,
    salt: privatesSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig
  });
  if (privatesProxy !== privatesCalcProxy) {
    throw new Error(
      `Privates contract actual address "${privatesProxy}" does not match expected "${privatesCalcProxy}"`
    );
  }

  // Calculate Wallets Registry proxy addresses via create2
  let {
    salt: walletsRegistrySalt,
    contractAddress: walletsRegistryCalcProxy
  } = await calculateContractAddress({ networkConfig });

  // Calculate Withdrawals proxy addresses via create2
  let {
    salt: withdrawalsSalt,
    contractAddress: withdrawalsCalcProxy
  } = await calculateContractAddress({ networkConfig });

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
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy
  });
  if (withdrawalsProxy !== withdrawalsCalcProxy) {
    throw new Error(
      `Withdrawals contract actual address "${withdrawalsProxy}" does not match expected "${withdrawalsCalcProxy}"`
    );
  }

  // Deploy Validator Transfers proxy
  let validatorTransfersProxy = await deployValidatorTransfersProxy({
    salt: validatorTransfersSalt,
    adminsProxy,
    depositsProxy,
    poolsProxy,
    settingsProxy,
    validatorsRegistryProxy,
    walletsRegistryProxy,
    withdrawalsProxy,
    networkConfig
  });
  if (validatorTransfersProxy !== validatorTransfersCalcProxy) {
    throw new Error(
      `Validator Transfers contract actual address "${validatorTransfersProxy}" does not match expected "${validatorTransfersCalcProxy}"`
    );
  }

  return {
    admins: adminsProxy,
    operators: operatorsProxy,
    walletsManagers: walletsManagersProxy,
    settings: settingsProxy,
    deposits: depositsProxy,
    validatorsRegistry: validatorsRegistryProxy,
    validatorTransfers: validatorTransfersProxy,
    pools: poolsProxy,
    privates: privatesProxy,
    walletsRegistry: walletsRegistryProxy,
    withdrawals: withdrawalsProxy
  };
}

module.exports = {
  deployAllProxies
};
