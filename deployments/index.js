const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
} = require('./access');
const { calculateContractAddress, log } = require('./common');
const { deployDepositsProxy } = require('./deposits');
const {
  deployPoolsProxy,
  deploySolosProxy,
  deployGroupsProxy,
} = require('./collectors');
const { deploySettingsProxy } = require('./settings');
const { deployWithdrawalsProxy } = require('./withdrawals');
const { deployValidatorsProxy } = require('./validators');
const { deployValidatorTransfersProxy } = require('./validatorTransfers');

async function deployAllProxies({ initialAdmin, networkConfig, vrc, dai }) {
  // Calculate Deposits proxy address via create2
  let {
    salt: depositsSalt,
    contractAddress: depositsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Validators proxy address via create2
  let {
    salt: validatorsSalt,
    contractAddress: validatorsCalcProxy,
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

  // Calculate Solos proxy address via create2
  let {
    salt: solosSalt,
    contractAddress: solosCalcProxy,
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

  // Calculate Withdrawals proxy addresses via create2
  let {
    salt: withdrawalsSalt,
    contractAddress: withdrawalsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Deploy Admins proxy
  let adminsProxy = await deployAdminsProxy({
    networkConfig,
    initialAdmin,
  });
  log(`Admins contract: ${adminsProxy}`);

  // Deploy Operators proxy
  let operatorsProxy = await deployOperatorsProxy({
    networkConfig,
    adminsProxy,
  });
  log(`Operators contract: ${operatorsProxy}`);

  // Deploy Settings proxy
  let settingsProxy = await deploySettingsProxy({
    networkConfig,
    adminsProxy,
    operatorsProxy,
  });
  log(`Settings contract: ${settingsProxy}`);

  // Deploy Managers proxy
  let managersProxy = await deployManagersProxy({
    networkConfig,
    adminsProxy,
    solosProxy: solosCalcProxy,
    groupsProxy: groupsCalcProxy,
  });
  log(`Managers contract: ${managersProxy}`);

  // Deploy Deposits proxy
  let depositsProxy = await deployDepositsProxy({
    phase2PoolsProxy: phase2PoolsCalcProxy,
    periodicPoolsProxy: periodicPoolsCalcProxy,
    solosProxy: solosCalcProxy,
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

  // Deploy Validators proxy
  let validatorsProxy = await deployValidatorsProxy({
    networkConfig,
    managersProxy,
    settingsProxy,
    periodicPoolsProxy: periodicPoolsCalcProxy,
    phase2PoolsProxy: phase2PoolsCalcProxy,
    solosProxy: solosCalcProxy,
    groupsProxy: groupsCalcProxy,
    withdrawalsProxy: withdrawalsCalcProxy,
    salt: validatorsSalt,
  });
  if (validatorsProxy !== validatorsCalcProxy) {
    throw new Error(
      `Validators contract actual address "${validatorsProxy}" does not match expected "${validatorsCalcProxy}"`
    );
  }
  log(`Validators contract: ${validatorsProxy}`);

  // Deploy periodic Pools proxy
  let periodicPoolsProxy = await deployPoolsProxy({
    vrc,
    salt: periodicPoolsSalt,
    managersProxy,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsProxy,
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
    managersProxy,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    validatorsProxy,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (phase2PoolsProxy !== phase2PoolsCalcProxy) {
    throw new Error(
      `Phase 2 Pools contract actual address "${phase2PoolsProxy}" does not match expected "${phase2PoolsCalcProxy}"`
    );
  }
  log(`Phase 2 Pools contract: ${phase2PoolsProxy}`);

  // Deploy Solos proxy
  let solosProxy = await deploySolosProxy({
    vrc,
    salt: solosSalt,
    depositsProxy,
    settingsProxy,
    operatorsProxy,
    managersProxy,
    validatorsProxy,
    dai,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (solosProxy !== solosCalcProxy) {
    throw new Error(
      `Solos contract actual address "${solosProxy}" does not match expected "${solosCalcProxy}"`
    );
  }
  log(`Solos contract: ${solosProxy}`);

  // Deploy Groups proxy
  let groupsProxy = await deployGroupsProxy({
    vrc,
    salt: groupsSalt,
    depositsProxy,
    settingsProxy,
    managersProxy,
    operatorsProxy,
    validatorsProxy,
    dai,
    validatorTransfersProxy: validatorTransfersCalcProxy,
    networkConfig,
  });
  if (groupsProxy !== groupsCalcProxy) {
    throw new Error(
      `Groups contract actual address "${groupsProxy}" does not match expected "${groupsCalcProxy}"`
    );
  }
  log(`Groups contract: ${groupsProxy}`);

  // Deploy Withdrawals proxy
  let withdrawalsProxy = await deployWithdrawalsProxy({
    salt: withdrawalsSalt,
    managersProxy,
    depositsProxy,
    settingsProxy,
    networkConfig,
    validatorsProxy,
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
    periodicPoolsProxy,
    phase2PoolsProxy,
    solosProxy,
    groupsProxy,
    withdrawalsProxy,
    depositsProxy,
    settingsProxy,
    validatorsProxy,
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
    validators: validatorsProxy,
    validatorTransfers: validatorTransfersProxy,
    pools: periodicPoolsProxy,
    phase2Pools: phase2PoolsProxy,
    solos: solosProxy,
    groups: groupsProxy,
    withdrawals: withdrawalsProxy,
  };
}

module.exports = {
  deployAllProxies,
};
