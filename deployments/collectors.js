const hre = require('hardhat');
const {
  getProxyAdminFactory,
} = require('@openzeppelin/hardhat-upgrades/dist/proxy-factory');

async function preparePoolUpgradeData(
  oraclesContractAddress,
  activatedValidators,
  pendingValidators,
  minActivatingDeposit,
  pendingValidatorsLimit
) {
  const Pool = await hre.ethers.getContractFactory('Pool');
  return Pool.interface.encodeFunctionData('upgrade', [
    oraclesContractAddress,
    activatedValidators,
    pendingValidators,
    minActivatingDeposit,
    pendingValidatorsLimit,
  ]);
}

async function upgradePool(
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
  upgradePool,
  preparePoolUpgradeData,
};
