const { ethers, upgrades } = require('hardhat');

async function deployAndInitializeERC20Mock(
  ownerAddress,
  name,
  symbol,
  totalSupply = '100000000000000000000000000' // 100000000 ETH
) {
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const erc20Mock = await ERC20Mock.deploy();
  await erc20Mock.initialize(ownerAddress, totalSupply, name, symbol);
  return erc20Mock.address;
}

async function deployAndInitializeStakeWiseToken(adminAddress) {
  const StakeWiseToken = await ethers.getContractFactory('StakeWiseToken');
  const proxy = await upgrades.deployProxy(StakeWiseToken, [adminAddress]);
  await proxy.deployed();
  return proxy.address;
}

module.exports = {
  deployAndInitializeERC20Mock,
  deployAndInitializeStakeWiseToken,
};
