const hre = require('hardhat');
const {
  getProxyAdminFactory,
} = require('@openzeppelin/hardhat-upgrades/dist/proxy-factory');
const { deploy } = require('@openzeppelin/hardhat-upgrades/dist/utils/deploy');
const {
  readValidations,
} = require('@openzeppelin/hardhat-upgrades/dist/validations');
const {
  assertUpgradeSafe,
  fetchOrDeploy,
  getStorageLayout,
  getStorageLayoutForAddress,
  getImplementationAddress,
  getVersion,
  getUnlinkedBytecode,
  Manifest,
} = require('@openzeppelin/upgrades-core');

// overrides: https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/%40openzeppelin/hardhat-upgrades%401.6.0/packages/plugin-hardhat/src/upgrade-proxy.ts#L34
async function prepareOraclesUpgrade(oraclesContractAddress) {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);
  const Oracles = await hre.ethers.getContractFactory('Oracles');

  const validations = await readValidations(hre);

  const unlinkedBytecode = getUnlinkedBytecode(validations, Oracles.bytecode);
  const version = getVersion(unlinkedBytecode, Oracles.bytecode);
  assertUpgradeSafe(validations, version, {});

  const currentImplAddress = await getImplementationAddress(
    provider,
    oraclesContractAddress
  );
  await getStorageLayoutForAddress(manifest, validations, currentImplAddress);
  const layout = getStorageLayout(validations, version);

  // skip storage check as it contains variable renames:
  // - from `totalRewardsUpdatePeriod` to `syncPeriod`
  // - from `totalRewardsNonce` to `nonce`

  return await fetchOrDeploy(version, provider, async () => {
    const deployment = await deploy(Oracles);
    return { ...deployment, layout };
  });
}

async function prepareOraclesUpgradeData(
  poolContractAddress,
  depositsActivationEnabled
) {
  const Oracles = await hre.ethers.getContractFactory('Oracles');
  return Oracles.interface.encodeFunctionData('initialize', [
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
  prepareOraclesUpgrade,
  prepareOraclesUpgradeData,
  upgradeOracles,
};
