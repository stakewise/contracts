const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
} = require('./access');
const { calculateContractAddress, log } = require('./common');
const { deployPoolProxy, deploySolosProxy } = require('./collectors');
const { deploySWDTokenProxy, deploySWRTokenProxy } = require('./tokens');
const { deployPaymentsProxy } = require('./payments');
const { deploySettingsProxy, initialSettings } = require('./settings');
const { deployValidatorsProxy } = require('./validators');

async function deployAllProxies({
  initialAdmin = initialSettings.admin,
  vrc = initialSettings.VRC,
  validatorsOracleProxy = initialSettings.validatorsOracle,
  networkConfig,
}) {
  // Calculate Validators proxy address via create2
  let {
    salt: validatorsSalt,
    contractAddress: validatorsCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Pool proxy address via create2
  let {
    salt: poolSalt,
    contractAddress: poolCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate Solos proxy address via create2
  let {
    salt: solosSalt,
    contractAddress: solosCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate swrToken proxy address via create2
  let {
    salt: swrTokenSalt,
    contractAddress: swrTokenCalcProxy,
  } = await calculateContractAddress({ networkConfig });

  // Calculate swdToken proxy address via create2
  let {
    salt: swdTokenSalt,
    contractAddress: swdTokenCalcProxy,
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

  // Deploy Managers proxy
  let managersProxy = await deployManagersProxy({
    networkConfig,
    adminsProxy,
  });
  log(`Managers contract: ${managersProxy}`);

  // Deploy Settings proxy
  let settingsProxy = await deploySettingsProxy({
    networkConfig,
    adminsProxy,
    operatorsProxy,
  });
  log(`Settings contract: ${settingsProxy}`);

  // Deploy Validators proxy
  let validatorsProxy = await deployValidatorsProxy({
    networkConfig,
    poolProxy: poolCalcProxy,
    solosProxy: solosCalcProxy,
    salt: validatorsSalt,
  });
  if (validatorsProxy !== validatorsCalcProxy) {
    throw new Error(
      `Validators contract actual address "${validatorsProxy}" does not match expected "${validatorsCalcProxy}"`
    );
  }
  log(`Validators contract: ${validatorsProxy}`);

  // Deploy Pool proxy
  let poolProxy = await deployPoolProxy({
    vrc,
    salt: poolSalt,
    swdTokenProxy: swdTokenCalcProxy,
    settingsProxy,
    operatorsProxy,
    validatorsProxy,
    networkConfig,
  });
  if (poolProxy !== poolCalcProxy) {
    throw new Error(
      `Pool contract actual address "${poolProxy}" does not match expected "${poolCalcProxy}"`
    );
  }
  log(`Pool contract: ${poolProxy}`);

  // Deploy Solos proxy
  let solosProxy = await deploySolosProxy({
    settingsProxy,
    operatorsProxy,
    vrc,
    validatorsProxy,
    salt: solosSalt,
    networkConfig,
  });
  if (solosProxy !== solosCalcProxy) {
    throw new Error(
      `Solos contract actual address "${solosProxy}" does not match expected "${solosCalcProxy}"`
    );
  }
  log(`Solos contract: ${solosProxy}`);

  // Deploy SWRToken proxy
  let swrTokenProxy = await deploySWRTokenProxy({
    swdTokenProxy: swdTokenCalcProxy,
    settingsProxy,
    validatorsOracleProxy,
    salt: swrTokenSalt,
    networkConfig,
  });
  if (swrTokenProxy !== swrTokenCalcProxy) {
    throw new Error(
      `SWRToken contract actual address "${swrTokenProxy}" does not match expected "${swrTokenCalcProxy}"`
    );
  }
  log(`SWRToken contract: ${swrTokenProxy}`);

  // Deploy SWDToken proxy
  let swdTokenProxy = await deploySWDTokenProxy({
    swrTokenProxy,
    poolProxy,
    settingsProxy,
    salt: swdTokenSalt,
    networkConfig,
  });
  if (swdTokenProxy !== swdTokenCalcProxy) {
    throw new Error(
      `SWDToken contract actual address "${swdTokenProxy}" does not match expected "${swdTokenCalcProxy}"`
    );
  }
  log(`SWDToken contract: ${swdTokenProxy}`);

  // Deploy Payments proxy
  let paymentsProxy = await deployPaymentsProxy({
    settingsProxy,
    managersProxy,
    networkConfig,
  });
  log(`Payments contract: ${paymentsProxy}`);

  return {
    admins: adminsProxy,
    operators: operatorsProxy,
    managers: managersProxy,
    settings: settingsProxy,
    validators: validatorsProxy,
    pool: poolProxy,
    solos: solosProxy,
    swdToken: swdTokenProxy,
    swrToken: swrTokenProxy,
  };
}

module.exports = {
  deployAllProxies,
};
