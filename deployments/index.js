const bre = require('@nomiclabs/buidler');
const { white, green } = require('chalk');

const {
  deployAndInitializeAdmins,
  deployAndInitializeManagers,
  deployAndInitializeOperators,
  deployValidatorsOracle,
  initializeValidatorsOracle,
} = require('./access');
const { deployValidators, initializeValidators } = require('./validators');
const { deployAndInitializeSettings, initialSettings } = require('./settings');
const {
  deploySolos,
  deployPool,
  initializeSolos,
  initializePool,
} = require('./collectors');
const {
  deploySWRToken,
  deploySWDToken,
  initializeSWRToken,
  initializeSWDToken,
} = require('./tokens');
const { deployAndInitializePayments } = require('./payments');

function log(message) {
  if (bre.config != null && bre.config.suppressLogs !== true) {
    console.log(message);
  }
}

async function deployAllContracts({
  initialAdmin = initialSettings.admin,
  vrcContractAddress = initialSettings.VRC,
} = {}) {
  // Deploy and initialize Admins contract
  const adminsContractAddress = await deployAndInitializeAdmins(initialAdmin);
  log(white(`Deployed Admins contract: ${green(adminsContractAddress)}`));

  // Deploy and initialize Managers contract
  const managersContractAddress = await deployAndInitializeManagers(
    adminsContractAddress
  );
  log(white(`Deployed Managers contract: ${green(managersContractAddress)}`));

  // Deploy and initialize Operators contract
  const operatorsContractAddress = await deployAndInitializeOperators(
    adminsContractAddress
  );
  log(white(`Deployed Operators contract: ${green(operatorsContractAddress)}`));

  // Deploy and initialize Settings contract
  const settingsContractAddress = await deployAndInitializeSettings(
    adminsContractAddress,
    operatorsContractAddress
  );
  log(white(`Deployed Settings contract: ${green(settingsContractAddress)}`));

  // Deploy and initialize Payments contract
  const paymentsContractAddress = await deployAndInitializePayments(
    settingsContractAddress,
    managersContractAddress
  );
  log(white(`Deployed Payments contract: ${green(paymentsContractAddress)}`));

  // Deploy contracts
  const validatorsContractAddress = await deployValidators();
  log(
    white(`Deployed Validators contract: ${green(validatorsContractAddress)}`)
  );

  const poolContractAddress = await deployPool();
  log(white(`Deployed Pool contract: ${green(poolContractAddress)}`));

  const solosContractAddress = await deploySolos();
  log(white(`Deployed Solos contract: ${green(solosContractAddress)}`));

  const swdTokenContractAddress = await deploySWDToken();
  log(white(`Deployed SWD Token contract: ${green(swdTokenContractAddress)}`));

  const swrTokenContractAddress = await deploySWRToken();
  log(white(`Deployed SWR Token contract: ${green(swrTokenContractAddress)}`));

  const validatorsOracleContractAddress = await deployValidatorsOracle();
  log(
    white(
      `Deployed Validators Oracle contract: ${green(
        validatorsOracleContractAddress
      )}`
    )
  );

  // Initialize contracts
  await initializeValidators(
    validatorsContractAddress,
    poolContractAddress,
    solosContractAddress,
    settingsContractAddress
  );
  log(white('Initialized Validators contract'));

  await initializePool(
    poolContractAddress,
    swdTokenContractAddress,
    settingsContractAddress,
    operatorsContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
  log(white('Initialized Pool contract'));

  await initializeSolos(
    solosContractAddress,
    settingsContractAddress,
    operatorsContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
  log(white('Initialized Solos contract'));

  await initializeSWDToken(
    swdTokenContractAddress,
    swrTokenContractAddress,
    settingsContractAddress,
    poolContractAddress
  );
  log(white('Initialized SWD Token contract'));

  await initializeSWRToken(
    swrTokenContractAddress,
    swdTokenContractAddress,
    settingsContractAddress,
    validatorsOracleContractAddress
  );
  log(white('Initialized SWR Token contract'));

  await initializeValidatorsOracle(
    validatorsOracleContractAddress,
    adminsContractAddress,
    settingsContractAddress,
    swrTokenContractAddress
  );
  log(white('Initialized Validators Oracle contract'));

  return {
    admins: adminsContractAddress,
    operators: operatorsContractAddress,
    managers: managersContractAddress,
    settings: settingsContractAddress,
    validators: validatorsContractAddress,
    validatorsOracle: validatorsOracleContractAddress,
    pool: poolContractAddress,
    solos: solosContractAddress,
    swdToken: swdTokenContractAddress,
    swrToken: swrTokenContractAddress,
  };
}

module.exports = {
  deployAllContracts,
};
