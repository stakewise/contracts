const { ethers, upgrades } = require('hardhat');
const { initialSettings } = require('./settings');

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

async function deployStakedEthToken() {
  const StakedEthToken = await ethers.getContractFactory('StakedEthToken');
  const proxy = await upgrades.deployProxy(StakedEthToken, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeStakedEthToken(
  stakedEthTokenContractAddress,
  adminAddress,
  rewardEthTokenContractAddress,
  poolContractAddress
) {
  let StakedEthToken = await ethers.getContractFactory('StakedEthToken');
  StakedEthToken = StakedEthToken.attach(stakedEthTokenContractAddress);

  return StakedEthToken.initialize(
    adminAddress,
    rewardEthTokenContractAddress,
    poolContractAddress
  );
}

async function deployRewardEthToken() {
  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  const proxy = await upgrades.deployProxy(RewardEthToken, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeRewardEthToken(
  rewardEthTokenContractAddress,
  adminAddress,
  stakedEthTokenContractAddress,
  oraclesContractAddress,
  stakedTokensContractAddress
) {
  let RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  RewardEthToken = RewardEthToken.attach(rewardEthTokenContractAddress);

  return RewardEthToken.initialize(
    adminAddress,
    stakedEthTokenContractAddress,
    oraclesContractAddress,
    stakedTokensContractAddress,
    initialSettings.maintainer,
    initialSettings.maintainerFee
  );
}

async function deployStakedTokens() {
  const StakedTokens = await ethers.getContractFactory('StakedTokens');
  const proxy = await upgrades.deployProxy(StakedTokens, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeStakedTokens(
  stakedTokensContractAddress,
  adminAddress,
  rewardEthTokenContractAddress
) {
  let StakedTokens = await ethers.getContractFactory('StakedTokens');
  StakedTokens = StakedTokens.attach(stakedTokensContractAddress);

  return StakedTokens.initialize(adminAddress, rewardEthTokenContractAddress);
}

module.exports = {
  deployAndInitializeERC20Mock,
  deployStakedEthToken,
  initializeStakedEthToken,
  deployRewardEthToken,
  initializeRewardEthToken,
  deployStakedTokens,
  initializeStakedTokens,
};
