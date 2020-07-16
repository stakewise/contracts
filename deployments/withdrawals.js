const { scripts } = require('@openzeppelin/cli');

async function deployWithdrawalsProxy({
  managersProxy,
  depositsProxy,
  settingsProxy,
  validatorsProxy,
  validatorTransfersProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Withdrawals',
    methodName: 'initialize',
    methodArgs: [
      managersProxy,
      depositsProxy,
      settingsProxy,
      validatorsProxy,
      validatorTransfersProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployWithdrawalsProxy,
};
