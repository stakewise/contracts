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

async function deployStakingEthToken() {
  const StakingEthToken = await ethers.getContractFactory('StakingEthToken');
  const proxy = await upgrades.deployProxy(StakingEthToken, [], {
    initializer: false,
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function initializeStakingEthToken(
  stakingEthTokenContractAddress,
  rewardEthTokenContractAddress,
  settingsContractAddress,
  poolContractAddress
) {
  let StakingEthToken = await ethers.getContractFactory('StakingEthToken');
  StakingEthToken = StakingEthToken.attach(stakingEthTokenContractAddress);

  return StakingEthToken.initialize(
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
  stakingEthTokenContractAddress,
  settingsContractAddress,
  balanceReportersContractAddress
) {
  let RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  RewardEthToken = RewardEthToken.attach(rewardEthTokenContractAddress);

  return RewardEthToken.initialize(
    stakingEthTokenContractAddress,
    settingsContractAddress,
    balanceReportersContractAddress
  );
}

module.exports = {
  deployAndInitializeERC20Mock,
  deployStakingEthToken,
  initializeStakingEthToken,
  deployRewardEthToken,
  initializeRewardEthToken,
};
