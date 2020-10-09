const { scripts } = require('@openzeppelin/cli');

async function deployValidatorsProxy({
  networkConfig,
  poolProxy,
  solosProxy,
  salt,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Validators',
    methodName: 'initialize',
    methodArgs: [poolProxy, solosProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorsProxy,
};
