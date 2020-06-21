const { scripts } = require('@openzeppelin/cli');

const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

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
      individualsProxy,
      privateIndividualsProxy,
      groupsProxy,
      settingsProxy,
    ],
    salt,
    ...networkConfig,
  });

  // TODO: remove after merging with constructor
  let validatorsRegistry = await ValidatorsRegistry.at(proxy.address);
  await validatorsRegistry.initialize2(phase2PoolsProxy);

  return proxy.address;
}

module.exports = {
  deployValidatorsRegistryProxy,
};
