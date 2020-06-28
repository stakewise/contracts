const { scripts } = require('@openzeppelin/cli');

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
      phase2PoolsProxy,
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

  return proxy.address;
}

module.exports = {
  deployValidatorTransfersProxy,
};
