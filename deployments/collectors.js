const { scripts } = require('@openzeppelin/cli');

async function deployPoolsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Pools',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsRegistryProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deployIndividualsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Individuals',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsRegistryProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deployGroupsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Groups',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsRegistryProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deployPrivateIndividualsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'PrivateIndividuals',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsRegistryProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployPoolsProxy,
  deployIndividualsProxy,
  deployPrivateIndividualsProxy,
  deployGroupsProxy,
};
