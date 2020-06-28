const { scripts } = require('@openzeppelin/cli');

async function deployDepositsProxy({
  phase2PoolsProxy,
  periodicPoolsProxy,
  individualsProxy,
  privateIndividualsProxy,
  groupsProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Deposits',
    methodName: 'initialize',
    methodArgs: [
      periodicPoolsProxy,
      phase2PoolsProxy,
      individualsProxy,
      privateIndividualsProxy,
      groupsProxy,
    ],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployDepositsProxy,
};
