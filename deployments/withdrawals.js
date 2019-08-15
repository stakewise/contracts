const { scripts, files } = require('@openzeppelin/cli');
const { encodeCall } = require('@openzeppelin/upgrades');
const { log } = require('./common');

function getWalletCreationParameters({ withdrawalsProxy, networkConfig }) {
  const networkFile = new files.NetworkFile(
    new files.ProjectFile(),
    networkConfig.network
  );

  const proxyAdmin = networkFile.proxyAdminAddress;
  const creationData = encodeCall(
    'initialize',
    ['address'],
    [withdrawalsProxy]
  );
  const implementation = networkFile.contracts.Wallet.address;

  return [proxyAdmin, implementation, creationData];
}

async function deployWalletsManagerProxy({
  adminsProxy,
  validatorsRegistryProxy,
  withdrawalsProxy,
  salt,
  networkConfig
}) {
  const [
    proxyAdmin,
    walletImplementation,
    walletCreationData
  ] = getWalletCreationParameters({ withdrawalsProxy, networkConfig });
  const proxy = await scripts.create({
    contractAlias: 'WalletsManager',
    methodName: 'initialize',
    methodArgs: [
      adminsProxy,
      validatorsRegistryProxy,
      withdrawalsProxy,
      proxyAdmin,
      walletImplementation,
      walletCreationData
    ],
    salt,
    ...networkConfig
  });

  log(`Wallets Manager contract: ${proxy.address}`);
  return proxy.address;
}

async function deployWithdrawalsProxy({
  adminsProxy,
  depositsProxy,
  settingsProxy,
  validatorsRegistryProxy,
  walletsManagerProxy,
  salt,
  networkConfig
}) {
  const proxy = await scripts.create({
    contractAlias: 'Withdrawals',
    methodName: 'initialize',
    methodArgs: [
      adminsProxy,
      depositsProxy,
      settingsProxy,
      validatorsRegistryProxy,
      walletsManagerProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Withdrawals contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployWalletsManagerProxy,
  deployWithdrawalsProxy
};
