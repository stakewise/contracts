const { scripts } = require('@openzeppelin/cli');
const { encodeCall } = require('@openzeppelin/upgrades');
const {
  ProjectFile,
  NetworkFile,
} = require('@openzeppelin/cli/lib/models/files').default;

async function deployValidatorsProxy({
  networkConfig,
  periodicPoolsProxy,
  phase2PoolsProxy,
  solosProxy,
  groupsProxy,
  managersProxy,
  settingsProxy,
  withdrawalsProxy,
  salt,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const walletImplementation = networkFile.contract('Wallet').address;
  const initData = encodeCall('initialize', ['address'], [withdrawalsProxy]);

  const proxy = await scripts.create({
    contractAlias: 'Validators',
    methodName: 'initialize',
    methodArgs: [
      periodicPoolsProxy,
      phase2PoolsProxy,
      solosProxy,
      groupsProxy,
      managersProxy,
      settingsProxy,
      walletImplementation,
      initData,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorsProxy,
};
