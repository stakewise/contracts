const { ethers } = require('hardhat');

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

module.exports = {
  deployAndInitializeERC20Mock,
};
