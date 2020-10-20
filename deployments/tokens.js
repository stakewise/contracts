const { scripts } = require('@openzeppelin/cli');
const { BN } = require('@openzeppelin/test-helpers');

async function deployDAI(initialHolder, params = {}) {
  const ERC20Mock = artifacts.require('ERC20MockUpgradeSafe');
  const name = 'DAI';
  const symbol = 'DAI';
  const initialSupply = new BN(100000000).mul(new BN(10).pow(new BN(18)));
  return ERC20Mock.new(name, symbol, initialHolder, initialSupply, params);
}

async function deploySWDTokenProxy({
  swrTokenProxy,
  settingsProxy,
  poolProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'SWDToken',
    methodName: 'initialize',
    methodArgs: [swrTokenProxy, settingsProxy, poolProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

async function deploySWRTokenProxy({
  swdTokenProxy,
  settingsProxy,
  validatorsOracleProxy,
  salt,
  networkConfig,
}) {
  const proxy = await scripts.create({
    contractAlias: 'SWRToken',
    methodName: 'initialize',
    methodArgs: [swdTokenProxy, settingsProxy, validatorsOracleProxy],
    salt,
    ...networkConfig,
  });

  return proxy.address;
}

module.exports = {
  deployDAI,
  deploySWDTokenProxy,
  deploySWRTokenProxy,
};
