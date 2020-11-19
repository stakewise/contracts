const hre = require('hardhat');
const { white, green } = require('chalk');

const {
  deployAndInitializeAdmins,
  deployAndInitializeManagers,
  deployAndInitializeOperators,
  deployBalanceReporters,
  initializeBalanceReporters,
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
  deployRewardEthToken,
  deployStakedEthToken,
  deployStakedTokens,
  initializeRewardEthToken,
  initializeStakedEthToken,
  initializeStakedTokens,
} = require('./tokens');
const { deployAndInitializePayments } = require('./payments');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
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

  const stakedEthTokenContractAddress = await deployStakedEthToken();
  log(
    white(
      `Deployed StakedEthToken contract: ${green(
        stakedEthTokenContractAddress
      )}`
    )
  );

  const rewardEthTokenContractAddress = await deployRewardEthToken();
  log(
    white(
      `Deployed RewardEthToken contract: ${green(
        rewardEthTokenContractAddress
      )}`
    )
  );

  const stakedTokensContractAddress = await deployStakedTokens();
  log(
    white(
      `Deployed StakedTokens contract: ${green(stakedTokensContractAddress)}`
    )
  );

  const balanceReportersContractAddress = await deployBalanceReporters();
  log(
    white(
      `Deployed BalanceReporters contract: ${green(
        balanceReportersContractAddress
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
    stakedEthTokenContractAddress,
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

  await initializeStakedEthToken(
    stakedEthTokenContractAddress,
    rewardEthTokenContractAddress,
    settingsContractAddress,
    poolContractAddress
  );
  log(white('Initialized StakedEthToken contract'));

  await initializeRewardEthToken(
    rewardEthTokenContractAddress,
    stakedEthTokenContractAddress,
    settingsContractAddress,
    balanceReportersContractAddress,
    stakedTokensContractAddress
  );
  log(white('Initialized RewardEthToken contract'));

  await initializeStakedTokens(
    stakedTokensContractAddress,
    settingsContractAddress,
    adminsContractAddress,
    rewardEthTokenContractAddress
  );
  log(white('Initialized StakedTokens contract'));

  await initializeBalanceReporters(
    balanceReportersContractAddress,
    adminsContractAddress,
    settingsContractAddress,
    rewardEthTokenContractAddress
  );
  log(white('Initialized BalanceReporters contract'));

  return {
    admins: adminsContractAddress,
    operators: operatorsContractAddress,
    managers: managersContractAddress,
    settings: settingsContractAddress,
    validators: validatorsContractAddress,
    balanceReporters: balanceReportersContractAddress,
    pool: poolContractAddress,
    solos: solosContractAddress,
    stakedEthToken: stakedEthTokenContractAddress,
    rewardEthToken: rewardEthTokenContractAddress,
  };
}

module.exports = {
  deployAllContracts,
};
