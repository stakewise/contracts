const { scripts } = require('@openzeppelin/cli');

async function deployValidatorsProxy({
  networkConfig,
  poolProxy,
  solosProxy,
  settingsProxy,
  salt,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Validators',
    methodName: 'initialize',
    methodArgs: [poolProxy, solosProxy, settingsProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorsProxy,
};
