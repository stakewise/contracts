const { scripts } = require('@openzeppelin/cli');
const {
  ProjectFile,
  NetworkFile,
} = require('@openzeppelin/cli/lib/models/files').default;

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
  dai,
  salt,
  networkConfig,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const paymentsImplementation = networkFile.contract('Payments').address;

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
      paymentsImplementation,
      dai,
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
  dai,
  salt,
  networkConfig,
}) {
  let networkFile = new NetworkFile(new ProjectFile(), networkConfig.network);
  const paymentsImplementation = networkFile.contract('Payments').address;

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
      paymentsImplementation,
      dai,
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
