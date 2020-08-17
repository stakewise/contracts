const { scripts } = require('@openzeppelin/cli');

// TODO: Replace with actual values
const initialSettings = {
  userDepositMinUnit: '1000000000000000',
  validatorDepositAmount: '32000000000000000000',
  validatorPrice: '3805175038051', // 10 DAI / month
  maintainerFee: '523', // 5.23%,
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  withdrawalCredentials:
    '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4',
};

async function deploySettingsProxy({
  networkConfig,
  adminsProxy,
  operatorsProxy,
}) {
  const proxy = await scripts.create({
    contractAlias: 'Settings',
    methodName: 'initialize',
    methodArgs: [
      initialSettings.maintainer,
      initialSettings.maintainerFee,
      initialSettings.userDepositMinUnit,
      initialSettings.validatorDepositAmount,
      initialSettings.validatorPrice,
      initialSettings.withdrawalCredentials,
      adminsProxy,
      operatorsProxy,
    ],
    ...networkConfig,
  });
  return proxy.address;
}

module.exports = {
  deploySettingsProxy,
  initialSettings,
};
