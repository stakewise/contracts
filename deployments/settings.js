const initialSettings = {
  minDepositUnit: '1000000000000000', // 0.001 ETH
  maxDepositAmount: '1000000000000000000000', // 1000 ETH
  validatorDepositAmount: '32000000000000000000', // 32 ETH
  validatorPrice: '10000000000000000000', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  allContractsPaused: false,
  // TODO: update to mainnet address
  VRC: '0x07b39F4fDE4A38bACe212b546dAc87C58DfE3fDC',
  withdrawalCredentials:
    '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4',
};

async function deployAndInitializeSettings(
  adminsContractAddress,
  operatorsContractAddress
) {
  const Settings = await ethers.getContractFactory('Settings');
  const proxy = await upgrades.deployProxy(Settings, [
    initialSettings.allContractsPaused,
    initialSettings.maintainerFee,
    initialSettings.minDepositUnit,
    initialSettings.validatorDepositAmount,
    initialSettings.maxDepositAmount,
    initialSettings.validatorPrice,
    initialSettings.maintainer,
    adminsContractAddress,
    operatorsContractAddress,
    initialSettings.withdrawalCredentials,
  ]);
  return proxy.address;
}

module.exports = {
  deployAndInitializeSettings,
  initialSettings,
};
