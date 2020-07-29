const { scripts } = require('@openzeppelin/cli');

async function deployAdminsProxy({ networkConfig, initialAdmin }) {
  const proxy = await scripts.create({
    contractAlias: 'Admins',
    methodName: 'initialize',
    methodArgs: [initialAdmin],
    ...networkConfig,
  });
  return proxy.address;
}

async function deployOperatorsProxy({ networkConfig, adminsProxy }) {
  const proxy = await scripts.create({
    contractAlias: 'Operators',
    methodName: 'initialize',
    methodArgs: [adminsProxy],
    ...networkConfig,
  });
  return proxy.address;
}

async function deployManagersProxy({
  networkConfig,
  adminsProxy,
  solosProxy,
  groupsProxy,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Managers',
    methodName: 'initialize',
    methodArgs: [solosProxy, groupsProxy, adminsProxy],
    ...networkConfig,
  });
  return proxy.address;
}

module.exports = {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
};
