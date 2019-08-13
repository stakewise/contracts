const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployPoolsProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  vrc,
  validatorsRegistryProxy,
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
      validatorsRegistryProxy
    ],
    salt,
    ...networkConfig
  });

  log(`Pools contract: ${proxy.address}`);
  return proxy.address;
}

module.exports.deployPoolsProxy = deployPoolsProxy;
