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
  rewardEthTokenContractAddress,
  settingsContractAddress,
  poolContractAddress
) {
  let StakedEthToken = await ethers.getContractFactory('StakedEthToken');
  StakedEthToken = StakedEthToken.attach(stakedEthTokenContractAddress);

  return StakedEthToken.initialize(
    rewardEthTokenContractAddress,
    settingsContractAddress,
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
  stakedEthTokenContractAddress,
  settingsContractAddress,
  balanceReportersContractAddress
) {
  let RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  RewardEthToken = RewardEthToken.attach(rewardEthTokenContractAddress);

  return RewardEthToken.initialize(
    stakedEthTokenContractAddress,
    settingsContractAddress,
    balanceReportersContractAddress
  );
}

module.exports = {
  deployAndInitializeERC20Mock,
  deployStakedEthToken,
  initializeStakedEthToken,
  deployRewardEthToken,
  initializeRewardEthToken,
};
