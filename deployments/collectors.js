const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

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

  log(`Pools contract: ${proxy.address}`);
  return proxy.address;
}

async function deployIndividualsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
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
    ],
    salt,
    ...networkConfig,
  });

  log(`Individuals contract: ${proxy.address}`);
  return proxy.address;
}

async function deployGroupsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
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
    ],
    salt,
    ...networkConfig,
  });

  log(`Groups contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployPoolsProxy,
  deployIndividualsProxy,
  deployGroupsProxy,
};
