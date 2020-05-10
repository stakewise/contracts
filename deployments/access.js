const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployAdminsProxy({ networkConfig, initialAdmin }) {
  const proxy = await scripts.create({
    contractAlias: 'Admins',
    methodName: 'initialize',
    methodArgs: [initialAdmin],
    ...networkConfig,
  });

  log(`Admins contract: ${proxy.address}`);
  return proxy.address;
}

async function deployOperatorsProxy({ networkConfig, adminsProxy }) {
  const proxy = await scripts.create({
    contractAlias: 'Operators',
    methodName: 'initialize',
    methodArgs: [adminsProxy],
    ...networkConfig,
  });

  log(`Operators contract: ${proxy.address}`);
  return proxy.address;
}

async function deployManagersProxy({ networkConfig, adminsProxy }) {
  const proxy = await scripts.create({
    contractAlias: 'Managers',
    methodName: 'initialize',
    methodArgs: [adminsProxy],
    ...networkConfig,
  });

  log(`Managers contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
};
