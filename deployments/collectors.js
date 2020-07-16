const { scripts } = require('@openzeppelin/cli');

async function deployPoolsProxy({
  vrc,
  managersProxy,
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  validatorsProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Pools',
    methodName: 'initialize',
    methodArgs: [
      managersProxy,
      depositsProxy,
      settingsProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deploySolosProxy({
  depositsProxy,
  settingsProxy,
  operatorsProxy,
  managersProxy,
  vrc,
  validatorsProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Solos',
    methodName: 'initialize',
    methodArgs: [
      depositsProxy,
      settingsProxy,
      managersProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
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
  managersProxy,
  vrc,
  validatorsProxy,
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
      managersProxy,
      operatorsProxy,
      vrc,
      validatorsProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployPoolsProxy,
  deploySolosProxy,
  deployGroupsProxy,
};
