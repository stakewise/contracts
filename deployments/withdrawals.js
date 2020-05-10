const { scripts } = require('@openzeppelin/cli');
const { encodeCall } = require('@openzeppelin/upgrades');
const {
  ProjectFile,
  NetworkFile,
} = require('@openzeppelin/cli/lib/models/files').default;
const { log } = require('./common');

async function deployWalletsRegistryProxy({
  managersProxy,
  validatorsRegistryProxy,
  withdrawalsProxy,
  salt,
  networkConfig,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const walletImplementation = networkFile.contract('Wallet').address;
  const initData = encodeCall('initialize', ['address'], [withdrawalsProxy]);

  const proxy = await scripts.create({
    contractAlias: 'WalletsRegistry',
    methodName: 'initialize',
    methodArgs: [
      managersProxy,
      validatorsRegistryProxy,
      withdrawalsProxy,
      networkFile.proxyFactory.address,
      walletImplementation,
      initData,
    ],
    salt,
    ...networkConfig,
  });

  log(`Wallets Registry contract: ${proxy.address}`);
  return proxy.address;
}

async function deployWithdrawalsProxy({
  managersProxy,
  depositsProxy,
  settingsProxy,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  walletsRegistryProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Withdrawals',
    methodName: 'initialize',
    methodArgs: [
      managersProxy,
      depositsProxy,
      settingsProxy,
      validatorsRegistryProxy,
      validatorTransfersProxy,
      walletsRegistryProxy,
    ],
    salt,
    ...networkConfig,
  });

  log(`Withdrawals contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployWalletsRegistryProxy,
  deployWithdrawalsProxy,
};
