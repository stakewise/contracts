const hre = require('hardhat');
const { BigNumber } = require('ethers');
const { deploy } = require('@openzeppelin/hardhat-upgrades/dist/utils/deploy');
const {
  readValidations,
} = require('@openzeppelin/hardhat-upgrades/dist/validations');
const {
  assertUpgradeSafe,
  assertStorageUpgradeSafe,
  fetchOrDeploy,
  getStorageLayout,
  getStorageLayoutForAddress,
  getImplementationAddress,
  getVersion,
  getUnlinkedBytecode,
  Manifest,
} = require('@openzeppelin/upgrades-core');

function calculateGasMargin(value) {
  return value
    .mul(BigNumber.from(10000))
    .add(BigNumber.from(1000))
    .div(BigNumber.from(10000));
}

// overrides: https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/%40openzeppelin/hardhat-upgrades%401.6.0/packages/plugin-hardhat/src/upgrade-proxy.ts#L34
async function prepareUpgrade(contract, contractAddress) {
  const { provider } = hre.network;
  const manifest = await Manifest.forNetwork(provider);

  const validations = await readValidations(hre);

  const unlinkedBytecode = getUnlinkedBytecode(validations, contract.bytecode);
  const version = getVersion(unlinkedBytecode, contract.bytecode);
  assertUpgradeSafe(validations, version, {});

  const currentImplAddress = await getImplementationAddress(
    provider,
    contractAddress
  );
  const deploymentLayout = await getStorageLayoutForAddress(
    manifest,
    validations,
    currentImplAddress
  );
  await getStorageLayoutForAddress(manifest, validations, currentImplAddress);
  const layout = getStorageLayout(validations, version);

  assertStorageUpgradeSafe(deploymentLayout, layout, false);

  return await fetchOrDeploy(version, provider, async () => {
    const deployment = await deploy(contract);
    return { ...deployment, layout };
  });
}

module.exports = {
  calculateGasMargin,
  prepareUpgrade,
};
