const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

async function deployDepositsProxy({
  poolsProxy,
  individualsProxy,
  salt,
  networkConfig
}) {
  const proxy = await scripts.create({
    contractAlias: 'Deposits',
    methodName: 'initialize',
    methodArgs: [poolsProxy, individualsProxy],
    salt,
    ...networkConfig
  });

  log(`Deposits contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deployDepositsProxy
};
