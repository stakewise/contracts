const hre = require('hardhat');
const {
  getProxyAdminFactory,
} = require('@openzeppelin/hardhat-upgrades/dist/proxy-factory');

async function prepareOraclesUpgradeData(
  poolContractAddress,
  depositsActivationEnabled
) {
  const Oracles = await hre.ethers.getContractFactory('Oracles');
  return Oracles.interface.encodeFunctionData('upgrade', [
    poolContractAddress,
    depositsActivationEnabled,
  ]);
}

async function upgradeOracles(
  adminAddress,
  proxyAdminContractAddress,
  oraclesContractAddress,
  nextImplementation,
  data
) {
  const signer = await hre.ethers.provider.getSigner(adminAddress);
  const AdminFactory = await getProxyAdminFactory(hre);
  const proxyAdmin = AdminFactory.attach(proxyAdminContractAddress);

  const proxy = await proxyAdmin
    .connect(signer)
    .upgradeAndCall(oraclesContractAddress, nextImplementation, data);
  return proxy.address;
}

module.exports = {
  prepareOraclesUpgradeData,
  upgradeOracles,
};
