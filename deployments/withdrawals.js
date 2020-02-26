const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployWalletsRegistryProxy({
  adminsProxy,
  walletsManagersProxy,
  validatorsRegistryProxy,
  withdrawalsProxy,
  salt,
  networkConfig
}) {
  const proxy = await scripts.create({
    contractAlias: 'WalletsRegistry',
    methodName: 'initialize',
    methodArgs: [
      adminsProxy,
      walletsManagersProxy,
      validatorsRegistryProxy,
      withdrawalsProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Wallets Registry contract: ${proxy.address}`);
  return proxy.address;
}

async function deployWithdrawalsProxy({
  walletsManagersProxy,
  depositsProxy,
  settingsProxy,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  walletsRegistryProxy,
  salt,
  networkConfig
}) {
  const proxy = await scripts.create({
    contractAlias: 'Withdrawals',
    methodName: 'initialize',
    methodArgs: [
      walletsManagersProxy,
      depositsProxy,
      settingsProxy,
      validatorsRegistryProxy,
      validatorTransfersProxy,
      walletsRegistryProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Withdrawals contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployWalletsRegistryProxy,
  deployWithdrawalsProxy
};
