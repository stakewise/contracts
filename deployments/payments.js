const { scripts } = require('@openzeppelin/cli');

async function deployPaymentsProxy({
  networkConfig,
  settingsProxy,
  managersProxy,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Payments',
    methodName: 'initialize',
    methodArgs: [settingsProxy, managersProxy],
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployPaymentsProxy,
};
