const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployValidatorsRegistry({
  networkConfig,
  settingsProxy,
  poolsProxy,
  individualsProxy,
  salt
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorsRegistry',
    methodName: 'initialize',
    methodArgs: [poolsProxy, individualsProxy, settingsProxy],
    salt,
    ...networkConfig
  });

  log(`Validators Registry contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployValidatorsRegistry
};
