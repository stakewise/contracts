const { scripts } = require('@openzeppelin/cli');

async function deployValidatorsRegistryProxy({
  networkConfig,
  settingsProxy,
  phase2PoolsProxy,
  periodicPoolsProxy,
  individualsProxy,
  privateIndividualsProxy,
  groupsProxy,
  salt,
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorsRegistry',
    methodName: 'initialize',
    methodArgs: [
      periodicPoolsProxy,
      phase2PoolsProxy,
      individualsProxy,
      privateIndividualsProxy,
      groupsProxy,
      settingsProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorsRegistryProxy,
};
