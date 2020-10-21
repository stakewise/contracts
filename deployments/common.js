const bre = require('@nomiclabs/buidler');
const {
  readValidations,
} = require('@openzeppelin/buidler-upgrades/dist/validations');
const {
  assertUpgradeSafe,
  getStorageLayout,
  fetchOrDeploy,
  fetchOrDeployAdmin,
  getVersion,
  getUnlinkedBytecode,
} = require('@openzeppelin/upgrades-core');
const { deploy } = require('@openzeppelin/buidler-upgrades/dist/utils/deploy');
const {
  getProxyFactory,
  getProxyAdminFactory,
} = require('@openzeppelin/buidler-upgrades/dist/proxy-factory');

// FIXME: https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/203
// Overrides from https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/plugin-buidler/src/deploy-proxy.ts#L29
async function deployProxy(ImplFactory, opts = {}) {
  const { provider } = bre.network;
  const validations = await readValidations(bre);

  const unlinkedBytecode = getUnlinkedBytecode(
    validations,
    ImplFactory.bytecode
  );
  const version = getVersion(unlinkedBytecode, ImplFactory.bytecode);
  assertUpgradeSafe(validations, version, opts);

  const impl = await fetchOrDeploy(version, provider, async () => {
    const deployment = await deploy(ImplFactory);
    const layout = getStorageLayout(validations, version);
    return { ...deployment, layout };
  });

  const AdminFactory = await getProxyAdminFactory(bre, ImplFactory.signer);
  const adminAddress = await fetchOrDeployAdmin(provider, () =>
    deploy(AdminFactory)
  );

  const ProxyFactory = await getProxyFactory(bre, ImplFactory.signer);
  const proxy = await ProxyFactory.deploy(impl, adminAddress, '0x');

  const inst = ImplFactory.attach(proxy.address);
  // noinspection JSConstantReassignment
  inst.deployTransaction = proxy.deployTransaction;
  return inst;
}

module.exports = {
  deployProxyWithoutInitialize: deployProxy,
};
