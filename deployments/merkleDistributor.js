const { ethers, upgrades } = require('hardhat');

async function deployAnInitializeMerkleDistributor(
  adminAddress,
  rewardEthTokenContractAddress,
  oraclesContractAddress
) {
  const MerkleDistributor = await ethers.getContractFactory(
    'MerkleDistributor'
  );
  const proxy = await upgrades.deployProxy(
    MerkleDistributor,
    [adminAddress, rewardEthTokenContractAddress, oraclesContractAddress],
    {
      kind: 'transparent',
      unsafeAllowCustomTypes: true,
    }
  );
  await proxy.deployed();
  return proxy.address;
}

module.exports = {
  deployAnInitializeMerkleDistributor,
};
