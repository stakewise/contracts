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
  networkConfig
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
      validatorTransfersProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Pools contract: ${proxy.address}`);
  return proxy.address;
}

async function deployPrivatesProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
  validatorTransfersProxy,
  salt,
  networkConfig
}) {
  const proxy = await scripts.create({
    contractAlias: 'Privates',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsRegistryProxy,
      validatorTransfersProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Privates contract: ${proxy.address}`);
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
  networkConfig
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
      validatorTransfersProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Groups contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = { deployPoolsProxy, deployPrivatesProxy, deployGroupsProxy };
