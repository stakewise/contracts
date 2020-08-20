const { BN } = require('@openzeppelin/test-helpers');
const { Contracts, ZWeb3 } = require('@openzeppelin/upgrades');
const { getNetworkConfig } = require('../deployments/common');

async function main() {
  // Initialize network connection
  ZWeb3.initialize(web3.currentProvider);
  let networkConfig = await getNetworkConfig();

  // deploy DAI contract
  const name = 'DAI';
  const symbol = 'DAI';
  const initialSupply = new BN(100000000).mul(new BN(10).pow(new BN(18)));
  const ERC20Mock = Contracts.getFromLocal('ERC20MockUpgradeSafe');

  let dai = await ERC20Mock.new(
    name,
    symbol,
    process.env.INITIAL_HOLDER,
    initialSupply.toString(),
    networkConfig.txParams
  );
  console.log(`DAI contract address: ${dai.address}`);
}

module.exports = function (cb) {
  main()
    .then(() => cb())
    .catch(cb);
};
