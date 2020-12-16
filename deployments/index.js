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
  maxDepositAmount: '1000000000000000000000', // 1000 ETH
  validatorDepositAmount: '32000000000000000000', // 32 ETH
  withdrawalLockDuration: '86400', // 1 day
  validatorPrice: '10000000000000000000', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0x08C96cfD285D039EdEB1a7c5CaF9ef0D0EE38c52',
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  allContractsPaused: false,
  // TODO: update to mainnet address
  VRC: '0x8c5fecdc472e27bc447696f431e425d02dd46a8c',
  withdrawalCredentials:
    '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4',
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
