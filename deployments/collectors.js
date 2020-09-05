const { scripts } = require('@openzeppelin/cli');
const { encodeCall } = require('@openzeppelin/upgrades');
const {
  ProjectFile,
  NetworkFile,
} = require('@openzeppelin/cli/lib/models/files').default;

async function deployPoolProxy({
  vrc,
  swdTokenProxy,
  settingsProxy,
  operatorsProxy,
  validatorsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Pool',
    methodName: 'initialize',
    methodArgs: [
      swdTokenProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deploySolosProxy({
  settingsProxy,
  operatorsProxy,
  managersProxy,
  vrc,
  validatorsProxy,
  solosProxy,
  groupsProxy,
  dai,
  salt,
  networkConfig,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const paymentsImplementation = networkFile.contract('Payments').address;
  const paymentsInitData = encodeCall(
    'initialize',
    ['address', 'address', 'address', 'address', 'address', 'address'],
    [operatorsProxy, managersProxy, settingsProxy, dai, solosProxy, groupsProxy]
  );

  const proxy = await scripts.create({
    contractAlias: 'Solos',
    methodName: 'initialize',
    methodArgs: [
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
      paymentsImplementation,
      paymentsInitData,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deployGroupsProxy({
  settingsProxy,
  operatorsProxy,
  managersProxy,
  vrc,
  validatorsProxy,
  solosProxy,
  groupsProxy,
  dai,
  salt,
  networkConfig,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const paymentsImplementation = networkFile.contract('Payments').address;
  const paymentsInitData = encodeCall(
    'initialize',
    ['address', 'address', 'address', 'address', 'address', 'address'],
    [operatorsProxy, managersProxy, settingsProxy, dai, solosProxy, groupsProxy]
  );

  const proxy = await scripts.create({
    contractAlias: 'Groups',
    methodName: 'initialize',
    methodArgs: [
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
      paymentsImplementation,
      paymentsInitData,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployPoolProxy,
  deploySolosProxy,
  deployGroupsProxy,
};
