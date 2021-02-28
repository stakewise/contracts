const { ethers, upgrades, network } = require('hardhat');
const { calculateGasMargin } = require('./utils');
const { initialSettings } = require('./settings');

let provider = new ethers.providers.Web3Provider(network.provider);

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
  });
  await proxy.deployed();
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

  const { hash } = await StakedEthToken.estimateGas
    .initialize(
      adminAddress,
      rewardEthTokenContractAddress,
      poolContractAddress
    )
    .then((estimatedGas) =>
      StakedEthToken.initialize(
        adminAddress,
        rewardEthTokenContractAddress,
        poolContractAddress,
        {
          gasLimit: calculateGasMargin(estimatedGas),
        }
      )
    );
  return provider.waitForTransaction(hash);
}

async function deployRewardEthToken() {
  const RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  const proxy = await upgrades.deployProxy(RewardEthToken, [], {
    initializer: false,
  });
  await proxy.deployed();
  return proxy.address;
}

async function initializeRewardEthToken(
  rewardEthTokenContractAddress,
  adminAddress,
  stakedEthTokenContractAddress,
  oraclesContractAddress
) {
  let RewardEthToken = await ethers.getContractFactory('RewardEthToken');
  RewardEthToken = RewardEthToken.attach(rewardEthTokenContractAddress);

  const { hash } = await RewardEthToken.estimateGas
    .initialize(
      adminAddress,
      stakedEthTokenContractAddress,
      oraclesContractAddress,
      initialSettings.maintainer,
      initialSettings.maintainerFee
    )
    .then((estimatedGas) =>
      RewardEthToken.initialize(
        adminAddress,
        stakedEthTokenContractAddress,
        oraclesContractAddress,
        initialSettings.maintainer,
        initialSettings.maintainerFee,
        {
          gasLimit: calculateGasMargin(estimatedGas),
        }
      )
    );
  return provider.waitForTransaction(hash);
}

module.exports = {
  deployAndInitializeERC20Mock,
  deployStakedEthToken,
  initializeStakedEthToken,
  deployRewardEthToken,
  initializeRewardEthToken,
};
