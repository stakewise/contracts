const initialSettings = {
  maxDepositAmount: '1000000000000000000000', // 1000 ETH
  validatorDepositAmount: '32000000000000000000', // 32 ETH
  withdrawalLockDuration: '86400', // 1 day
  validatorPrice: '10000000000000000000', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0x08C96cfD285D039EdEB1a7c5CaF9ef0D0EE38c52',
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  allContractsPaused: false,
  // TODO: update to mainnet address
  VRC: '0x8c5fecdc472e27bc447696f431e425d02dd46a8c',
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
    initialSettings.validatorDepositAmount,
    initialSettings.maxDepositAmount,
    initialSettings.withdrawalLockDuration,
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
