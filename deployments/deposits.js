const { scripts } = require('@openzeppelin/cli');

const Deposits = artifacts.require('Deposits');

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
      individualsProxy,
      privateIndividualsProxy,
      groupsProxy,
    ],
    salt,
    ...networkConfig,
  });

  // TODO: remove after merging with constructor
  let deposits = await Deposits.at(proxy.address);
  await deposits.initialize2(phase2PoolsProxy);

  return proxy.address;
}

module.exports = {
  deployDepositsProxy,
};
