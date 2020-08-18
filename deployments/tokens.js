const { BN } = require('@openzeppelin/test-helpers');

const ERC20Mock = artifacts.require('ERC20MockUpgradeSafe');

async function deployDAI(initialHolder, params = {}) {
  const name = 'DAI';
  const symbol = 'DAI';
  const initialSupply = new BN(100000000);
  return ERC20Mock.new(name, symbol, initialHolder, initialSupply, params);
}

module.exports = {
  deployDAI,
};
