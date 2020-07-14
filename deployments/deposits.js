const { scripts } = require('@openzeppelin/cli');

async function deployDepositsProxy({
  periodicPoolsProxy,
  phase2PoolsProxy,
  solosProxy,
  groupsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Deposits',
    methodName: 'initialize',
    methodArgs: [periodicPoolsProxy, phase2PoolsProxy, solosProxy, groupsProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployDepositsProxy,
};
