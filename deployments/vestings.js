const hre = require('hardhat');
const { Manifest } = require('@openzeppelin/upgrades-core');
const { prepareUpgrade } = require('./utils');
const { contracts } = require('./settings');

async function deployVestingEscrow() {
  // VestingEscrow is deployed without initialization as its clones are initialized
  const VestingEscrow = await hre.ethers.getContractFactory('VestingEscrow');
  const vestingEscrow = await VestingEscrow.deploy();
  await vestingEscrow.deployed();
  return vestingEscrow.address;
}

async function upgradeVestingEscrowFactory(
  adminAddress,
  proxyAdminContractAddress,
  poolContractAddress,
  nextImplementation,
  data
) {
  const signer = await hre.ethers.provider.getSigner(adminAddress);
  const AdminFactory = await getProxyAdminFactory(hre);
  const proxyAdmin = AdminFactory.attach(proxyAdminContractAddress);

  const proxy = await proxyAdmin
    .connect(signer)
    .upgradeAndCall(poolContractAddress, nextImplementation, data);
  return proxy.address;
}

module.exports = {
  deployVestingEscrow
};
