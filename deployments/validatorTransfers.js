const { scripts } = require('@openzeppelin/cli');

const ValidatorTransfers = artifacts.require('ValidatorTransfers');

async function deployValidatorTransfersProxy({
  adminsProxy,
  depositsProxy,
  phase2PoolsProxy,
  periodicPoolsProxy,
  individualsProxy,
  groupsProxy,
  settingsProxy,
  validatorsRegistryProxy,
  walletsRegistryProxy,
  withdrawalsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorTransfers',
    methodName: 'initialize',
    methodArgs: [
      adminsProxy,
      depositsProxy,
      periodicPoolsProxy,
      individualsProxy,
      groupsProxy,
      settingsProxy,
      validatorsRegistryProxy,
      walletsRegistryProxy,
      withdrawalsProxy,
    ],
    salt,
    ...networkConfig,
  });

  // TODO: remove after merging with constructor
  let validatorTransfers = await ValidatorTransfers.at(proxy.address);
  await validatorTransfers.initialize2(phase2PoolsProxy);

  return proxy.address;
}

module.exports = {
  deployValidatorTransfersProxy,
};
