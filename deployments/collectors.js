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
async function preparePoolUpgrade(poolContractAddress) {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);
  const Pool = await hre.ethers.getContractFactory('Pool');

  const validations = await readValidations(hre);

  const unlinkedBytecode = getUnlinkedBytecode(validations, Pool.bytecode);
  const version = getVersion(unlinkedBytecode, Pool.bytecode);
  assertUpgradeSafe(validations, version, {});

  const currentImplAddress = await getImplementationAddress(
    provider,
    poolContractAddress
  );
  await getStorageLayoutForAddress(manifest, validations, currentImplAddress);
  const layout = getStorageLayout(validations, version);

  // skip storage check as it contains variable rename
  // from `collectedAmount` to `activatingAmount`
  // TODO: re-enable in future upgrades

  return await fetchOrDeploy(version, provider, async () => {
    const deployment = await deploy(Pool);
    return { ...deployment, layout };
  });
}

async function preparePoolUpgradeData(
  oraclesContractAddress,
  activationDuration,
  beaconActivatingAmount,
  minActivatingDeposit,
  minActivatingShare
) {
  const Pool = await hre.ethers.getContractFactory('Pool');
  return Pool.interface.encodeFunctionData('initialize', [
    oraclesContractAddress,
    activationDuration,
    beaconActivatingAmount,
    minActivatingDeposit,
    minActivatingShare,
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
  preparePoolUpgrade,
  preparePoolUpgradeData,
};
