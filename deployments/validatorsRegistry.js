const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployValidatorsRegistry({
  networkConfig,
  settingsProxy,
  poolsProxy,
  salt
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorsRegistry',
    methodName: 'initialize',
    methodArgs: [poolsProxy, settingsProxy],
    salt,
    ...networkConfig
  });

  log(`Validators Registry contract: ${proxy.address}`);
  return proxy.address;
}

module.exports.deployValidatorsRegistry = deployValidatorsRegistry;
