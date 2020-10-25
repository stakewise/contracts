const { ethers, upgrades } = require('@nomiclabs/buidler');

async function deployAndInitializeERC20Mock(ownerAddress, name, symbol) {
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const erc20Mock = await ERC20Mock.deploy();
  await erc20Mock.initialize(
    ownerAddress,
    '100000000000000000000000000', // 100000000 ETH
    name,
    symbol
  );
  return erc20Mock.address;
}

async function deploySWDToken() {
  const SWDToken = await ethers.getContractFactory('SWDToken');
  const proxy = await upgrades.deployProxy(SWDToken, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeSWDToken(
  swdTokenContractAddress,
  swrTokenContractAddress,
  settingsContractAddress,
  poolContractAddress
) {
  let SWDToken = await ethers.getContractFactory('SWDToken');
  SWDToken = SWDToken.attach(swdTokenContractAddress);

  return SWDToken.initialize(
    swrTokenContractAddress,
    settingsContractAddress,
    poolContractAddress
  );
}

async function deploySWRToken() {
  const SWRToken = await ethers.getContractFactory('SWRToken');
  const proxy = await upgrades.deployProxy(SWRToken, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeSWRToken(
  swrTokenContractAddress,
  swdTokenContractAddress,
  settingsContractAddress,
  balanceReportersContractAddress
) {
  let SWRToken = await ethers.getContractFactory('SWRToken');
  SWRToken = SWRToken.attach(swrTokenContractAddress);

  return SWRToken.initialize(
    swdTokenContractAddress,
    settingsContractAddress,
    balanceReportersContractAddress
  );
}

module.exports = {
  deployAndInitializeERC20Mock,
  deploySWDToken,
  initializeSWDToken,
  deploySWRToken,
  initializeSWRToken,
};
