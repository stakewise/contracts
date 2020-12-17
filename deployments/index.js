const hre = require('hardhat');
const { white, green } = require('chalk');

const {
  deployValidators,
  initializeValidators,
  deployBalanceReporters,
  initializeBalanceReporters,
} = require('./validators');
const { deploySolos, deployPool, initializePool } = require('./collectors');
const {
  deployRewardEthToken,
  deployStakedEthToken,
  deployStakedTokens,
  initializeRewardEthToken,
  initializeStakedEthToken,
  initializeStakedTokens,
} = require('./tokens');

function log(message) {
  if (hre.config != null && hre.config.suppressLogs !== true) {
    console.log(message);
  }
}

const initialSettings = {
  admin: '0x08C96cfD285D039EdEB1a7c5CaF9ef0D0EE38c52',
  VRC: '0x00000000219ab540356cbb839cbe05303d7705fa',
};

async function deployAllContracts({
  initialAdmin = initialSettings.admin,
  vrcContractAddress = initialSettings.VRC,
} = {}) {
  // Deploy contracts
  const validatorsContractAddress = await deployValidators();
  log(
    white(`Deployed Validators contract: ${green(validatorsContractAddress)}`)
  );

  const poolContractAddress = await deployPool();
  log(white(`Deployed Pool contract: ${green(poolContractAddress)}`));

  const solosContractAddress = await deploySolos(
    initialAdmin,
    vrcContractAddress,
    validatorsContractAddress
  );
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
    initialAdmin,
    poolContractAddress,
    solosContractAddress
  );
  log(white('Initialized Validators contract'));

  await initializePool(
    poolContractAddress,
    initialAdmin,
    stakedEthTokenContractAddress,
    vrcContractAddress,
    validatorsContractAddress
  );
  log(white('Initialized Pool contract'));

  await initializeStakedEthToken(
    stakedEthTokenContractAddress,
    initialAdmin,
    rewardEthTokenContractAddress,
    poolContractAddress
  );
  log(white('Initialized StakedEthToken contract'));

  await initializeRewardEthToken(
    rewardEthTokenContractAddress,
    initialAdmin,
    stakedEthTokenContractAddress,
    balanceReportersContractAddress,
    stakedTokensContractAddress
  );
  log(white('Initialized RewardEthToken contract'));

  await initializeStakedTokens(
    stakedTokensContractAddress,
    initialAdmin,
    rewardEthTokenContractAddress
  );
  log(white('Initialized StakedTokens contract'));

  await initializeBalanceReporters(
    balanceReportersContractAddress,
    initialAdmin,
    rewardEthTokenContractAddress
  );
  log(white('Initialized BalanceReporters contract'));

  return {
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
