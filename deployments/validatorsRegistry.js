const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployValidatorsRegistryProxy({
  networkConfig,
  settingsProxy,
  poolsProxy,
  privatesProxy,
  groupsProxy,
  salt
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorsRegistry',
    methodName: 'initialize',
    methodArgs: [poolsProxy, privatesProxy, groupsProxy, settingsProxy],
    salt,
    ...networkConfig
  });

  log(`Validators Registry contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployValidatorsRegistryProxy
};
