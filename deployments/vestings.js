const { ethers, upgrades } = require('hardhat');

async function deployAndInitializeVestingEscrowFactory(
  adminAddress,
  escrowImplementationAddress
) {
  const VestingEscrowFactory = await ethers.getContractFactory(
    'VestingEscrowFactory'
  );
  const proxy = await upgrades.deployProxy(VestingEscrowFactory, [
    adminAddress,
    escrowImplementationAddress,
  ]);
  await proxy.deployed();
  return proxy.address;
}

async function deployVestingEscrow() {
  // VestingEscrow is deployed without initialization as its clones are initialized
  const VestingEscrow = await ethers.getContractFactory('VestingEscrow');
  const vestingEscrow = await VestingEscrow.deploy();
  await vestingEscrow.deployed();
  return vestingEscrow.address;
}

module.exports = {
  deployVestingEscrow,
  deployAndInitializeVestingEscrowFactory,
};
