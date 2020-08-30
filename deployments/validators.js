const { scripts } = require('@openzeppelin/cli');

async function deployValidatorsProxy({
  networkConfig,
  poolProxy,
  solosProxy,
  groupsProxy,
  salt,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Validators',
    methodName: 'initialize',
    methodArgs: [poolProxy, solosProxy, groupsProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployValidatorsProxy,
};
