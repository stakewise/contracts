const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
} = require('../deployments/access');
const { calculateContractAddress, log } = require('../deployments/common');
const { deployDepositsProxy } = require('../deployments/deposits');
const {
  deployPoolsProxy,
  deployIndividualsProxy,
  deployPrivateIndividualsProxy,
  deployGroupsProxy,
} = require('../deployments/collectors');
const { deploySettingsProxy } = require('../deployments/settings');
const {
  deployWalletsRegistryProxy,
  deployWithdrawalsProxy,
} = require('../deployments/withdrawals');
const {
  deployValidatorsRegistryProxy,
} = require('../deployments/validatorsRegistry');
const {
  deployValidatorTransfersProxy,
} = require('../deployments/validatorTransfers');

async function deployAllProxies({ initialAdmin, networkConfig, vrc }) {
  // Deploy admins, operators, managers proxies
  let adminsProxy = await deployAdminsProxy({
    networkConfig,
    initialAdmin,
  });
  log(`Admins contract: ${adminsProxy}`);

  let operatorsProxy = await deployOperatorsProxy({
    networkConfig,
    adminsProxy,
  });
  log(`Operators contract: ${operatorsProxy}`);

  let managersProxy = await deployManagersProxy({
    networkConfig,
    adminsProxy,
  });
  log(`Managers contract: ${managersProxy}`);

  // Deploy global settings
  let settingsProxy = await deploySettingsProxy({
    networkConfig,
    adminsProxy,
    operatorsProxy,
  });
  log(`Settings contract: ${settingsProxy}`);

  // Calculate Deposits proxy address via create2
  let {
    salt: depositsSalt,
    contractAddress: depositsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Validators Registry proxy address via create2
  let {
    salt: validatorsRegistrySalt,
    contractAddress: validatorsRegistryCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate periodic Pools proxy address via create2
  let {
    salt: periodicPoolsSalt,
    contractAddress: periodicPoolsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate phase 2 Pools proxy address via create2
  let {
    salt: phase2PoolsSalt,
    contractAddress: phase2PoolsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Individuals proxy address via create2
  let {
    salt: individualsSalt,
    contractAddress: individualsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Private Individuals proxy address via create2
  let {
    salt: privateIndividualsSalt,
    contractAddress: privateIndividualsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Groups proxy address via create2
  let {
    salt: groupsSalt,
    contractAddress: groupsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Validator Transfers proxy address via create2
  let {
    salt: validatorTransfersSalt,
    contractAddress: validatorTransfersCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Deploy Deposits proxy
  let depositsProxy = await deployDepositsProxy({
    phase2PoolsProxy: phase2PoolsCalcProxy,
    periodicPoolsProxy: periodicPoolsCalcProxy,
    individualsProxy: individualsCalcProxy,
    privateIndividualsProxy: privateIndividualsCalcProxy,
    groupsProxy: groupsCalcProxy,
    salt: depositsSalt,
    networkConfig,
  });
  if (depositsProxy !== depositsCalcProxy) {
    throw new Error(
      `Deposits contract actual address "${depositsProxy}" does not match expected "${depositsCalcProxy}"`
    );
  }
  log(`Deposits contract: ${depositsProxy}`);

  // Deploy Validators Registry proxy
  let validatorsRegistryProxy = await deployValidatorsRegistryProxy({
    phase2PoolsProxy: phase2PoolsCalcProxy,
    periodicPoolsProxy: periodicPoolsCalcProxy,
    individualsProxy: individualsCalcProxy,
    privateIndividualsProxy: privateIndividualsCalcProxy,
    groupsProxy: groupsCalcProxy,
    salt: validatorsRegistrySalt,
    settingsProxy,
    networkConfig,
  });
  if (validatorsRegistryProxy !== validatorsRegistryCalcProxy) {
    throw new Error(
      `Validators Registry contract actual address "${validatorsRegistryProxy}" does not match expected "${validatorsRegistryCalcProxy}"`
    );
  }
  log(`Validators Registry contract: ${validatorsRegistryProxy}`);

  // Deploy periodic Pools proxy
  let periodicPoolsProxy = await deployPoolsProxy({
    vrc,
    salt: periodicPoolsSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (periodicPoolsProxy !== periodicPoolsCalcProxy) {
    throw new Error(
      `Periodic Pools contract actual address "${periodicPoolsProxy}" does not match expected "${periodicPoolsCalcProxy}"`
    );
  }
  log(`Periodic Pools contract: ${periodicPoolsProxy}`);

  // Deploy phase 2 Pools proxy
  let phase2PoolsProxy = await deployPoolsProxy({
    vrc,
    salt: phase2PoolsSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (phase2PoolsProxy !== phase2PoolsCalcProxy) {
    throw new Error(
      `Phase 2 Pools contract actual address "${phase2PoolsProxy}" does not match expected "${phase2PoolsCalcProxy}"`
    );
  }
  log(`Phase 2 Pools contract: ${phase2PoolsProxy}`);

  // Deploy Individuals proxy
  let individualsProxy = await deployIndividualsProxy({
    vrc,
    salt: individualsSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (individualsProxy !== individualsCalcProxy) {
    throw new Error(
      `Individuals contract actual address "${individualsProxy}" does not match expected "${individualsCalcProxy}"`
    );
  }
  log(`Individuals contract: ${individualsProxy}`);

  // Deploy Private Individuals proxy
  let privateIndividualsProxy = await deployPrivateIndividualsProxy({
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    vrc,
    validatorsRegistryProxy,
    salt: privateIndividualsSalt,
    networkConfig,
  });
  if (privateIndividualsProxy !== privateIndividualsCalcProxy) {
    throw new Error(
      `Private Individuals contract actual address "${privateIndividualsProxy}" does not match expected "${privateIndividualsCalcProxy}"`
    );
  }
  log(`Private Individuals contract: ${privateIndividualsProxy}`);

  // Deploy Groups proxy
  let groupsProxy = await deployGroupsProxy({
    vrc,
    salt: groupsSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (groupsProxy !== groupsCalcProxy) {
    throw new Error(
      `Groups contract actual address "${groupsProxy}" does not match expected "${groupsCalcProxy}"`
    );
  }
  log(`Groups contract: ${groupsProxy}`);

  // Calculate Wallets Registry proxy addresses via create2
  let {
    salt: walletsRegistrySalt,
    contractAddress: walletsRegistryCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Withdrawals proxy addresses via create2
  let {
    salt: withdrawalsSalt,
    contractAddress: withdrawalsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Deploy Wallets Registry proxy
  let walletsRegistryProxy = await deployWalletsRegistryProxy({
    withdrawalsProxy: withdrawalsCalcProxy,
    salt: walletsRegistrySalt,
    validatorsRegistryProxy,
    networkConfig,
    managersProxy,
  });
  if (walletsRegistryProxy !== walletsRegistryCalcProxy) {
    throw new Error(
      `Wallets Registry contract actual address "${walletsRegistryProxy} does not match expected "${walletsRegistryCalcProxy}"`
    );
  }
  log(`Wallets Registry contract: ${walletsRegistryProxy}`);

  // Deploy Withdrawals proxy
  let withdrawalsProxy = await deployWithdrawalsProxy({
    salt: withdrawalsSalt,
    managersProxy,
    depositsProxy,
    settingsProxy,
    networkConfig,
    walletsRegistryProxy,
    validatorsRegistryProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
  });
  if (withdrawalsProxy !== withdrawalsCalcProxy) {
    throw new Error(
      `Withdrawals contract actual address "${withdrawalsProxy}" does not match expected "${withdrawalsCalcProxy}"`
    );
  }
  log(`Withdrawals contract: ${withdrawalsProxy}`);

  // Deploy Validator Transfers proxy
  let validatorTransfersProxy = await deployValidatorTransfersProxy({
    salt: validatorTransfersSalt,
    adminsProxy,
    depositsProxy,
    periodicPoolsProxy,
    phase2PoolsProxy,
    individualsProxy,
    groupsProxy,
    settingsProxy,
    validatorsRegistryProxy,
    walletsRegistryProxy,
    withdrawalsProxy,
    networkConfig,
  });
  if (validatorTransfersProxy !== validatorTransfersCalcProxy) {
    throw new Error(
      `Validator Transfers contract actual address "${validatorTransfersProxy}" does not match expected "${validatorTransfersCalcProxy}"`
    );
  }
  log(`Validator Transfers contract: ${validatorTransfersProxy}`);

  return {
    admins: adminsProxy,
    operators: operatorsProxy,
    managers: managersProxy,
    settings: settingsProxy,
    deposits: depositsProxy,
    validatorsRegistry: validatorsRegistryProxy,
    validatorTransfers: validatorTransfersProxy,
    pools: periodicPoolsProxy,
    phase2Pools: phase2PoolsProxy,
    individuals: individualsProxy,
    privateIndividuals: privateIndividualsProxy,
    groups: groupsProxy,
    walletsRegistry: walletsRegistryProxy,
    withdrawals: withdrawalsProxy,
  };
}

module.exports = {
  deployAllProxies,
};
