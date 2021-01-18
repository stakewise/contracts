const hre = require('hardhat');
const {
  getManifestAdmin,
} = require('@openzeppelin/hardhat-upgrades/dist/admin.js');
const { white, green } = require('chalk');
const { initialSettings } = require('./settings');

const {
  deployValidators,
  initializeValidators,
  deployOracles,
  initializeOracles,
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

async function deployAllContracts({
  initialAdmin = initialSettings.admin,
  vrcContractAddress = initialSettings.VRC,
  transferProxyAdminOwnership = false,
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

  const oraclesContractAddress = await deployOracles();
  log(white(`Deployed Oracles contract: ${green(oraclesContractAddress)}`));

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
    oraclesContractAddress,
    stakedTokensContractAddress
  );
  log(white('Initialized RewardEthToken contract'));

  await initializeStakedTokens(
    stakedTokensContractAddress,
    initialAdmin,
    rewardEthTokenContractAddress
  );
  log(white('Initialized StakedTokens contract'));

  await initializeOracles(
    oraclesContractAddress,
    initialAdmin,
    rewardEthTokenContractAddress,
    initialSettings.totalRewardsUpdatePeriod
  );
  log(white('Initialized Oracles contract'));

  if (transferProxyAdminOwnership) {
    const admin = await getManifestAdmin(hre);
    await hre.upgrades.admin.transferProxyAdminOwnership(initialAdmin);
    let newOwner = await admin.owner();
    for (let i = 0; i < 10; i++) {
      if (newOwner === initialAdmin) {
        log(white(`Transferred proxy admin ownership to ${newOwner}`));
        return;
      }
      newOwner = await admin.owner();
    }
    throw Error(
      `Failed to transfer proxy admin ownership: expected=${initialAdmin},
       actual=${newOwner}`
    );
  }

  return {
    validators: validatorsContractAddress,
    oracles: oraclesContractAddress,
    pool: poolContractAddress,
    solos: solosContractAddress,
    stakedEthToken: stakedEthTokenContractAddress,
    rewardEthToken: rewardEthTokenContractAddress,
  };
}

module.exports = {
  deployAllContracts,
};
