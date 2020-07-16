const { scripts } = require('@openzeppelin/cli');

async function deployValidatorTransfersProxy({
  periodicPoolsProxy,
  phase2PoolsProxy,
  solosProxy,
  groupsProxy,
  withdrawalsProxy,
  depositsProxy,
  settingsProxy,
  validatorsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'ValidatorTransfers',
    methodName: 'initialize',
    methodArgs: [
      periodicPoolsProxy,
      phase2PoolsProxy,
      solosProxy,
      groupsProxy,
      withdrawalsProxy,
      depositsProxy,
      settingsProxy,
      validatorsProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorTransfersProxy,
};
