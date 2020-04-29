const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployValidatorTransfersProxy({
  adminsProxy,
  depositsProxy,
  poolsProxy,
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
      poolsProxy,
      settingsProxy,
      validatorsRegistryProxy,
      walletsRegistryProxy,
      withdrawalsProxy,
    ],
    salt,
    ...networkConfig,
  });

  log(`Validator Transfers contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployValidatorTransfersProxy,
};
