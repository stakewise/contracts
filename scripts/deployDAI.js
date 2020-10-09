const { BN } = require('@openzeppelin/test-helpers');
const { Contracts, ZWeb3 } = require('@openzeppelin/upgrades');
const { initialSettings } = require('../deployments/settings');

async function main() {
  // Initialize network connection
  ZWeb3.initialize(web3.currentProvider);

  // deploy DAI contract
  const name = 'DAI';
  const symbol = 'DAI';
  const initialSupply = new BN(100000000).mul(new BN(10).pow(new BN(18)));
  const ERC20Mock = Contracts.getFromLocal('ERC20MockUpgradeSafe');

  let dai = await ERC20Mock.new(
    name,
    symbol,
    initialSettings.admin,
    initialSupply.toString(),
    { gas: 4712388, gasPrice: 100000000000 }
  );
  console.log(`DAI contract address: ${dai.address}`);
}

module.exports = function (cb) {
  main()
    .then(() => cb())
    .catch(cb);
};
