async function deployAndInitializePayments(
  settingsContractAddress,
  managersContractAddress
) {
  const Payments = await ethers.getContractFactory('Payments');
  const proxy = await upgrades.deployProxy(
    Payments,
    [settingsContractAddress, managersContractAddress],
    {
      unsafeAllowCustomTypes: true,
    }
  );
  return proxy.address;
}

module.exports = {
  deployAndInitializePayments,
};
