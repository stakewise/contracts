const { scripts } = require('@openzeppelin/cli');

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
  vrc,
  validatorsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Solos',
    methodName: 'initialize',
    methodArgs: [settingsProxy, operatorsProxy, vrc, validatorsProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployPoolProxy,
  deploySolosProxy,
};
