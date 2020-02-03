const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

// TODO: Replace with actual values
const initialSettings = {
  userDepositMinUnit: '1000000000000000',
  validatorDepositAmount: '32000000000000000000',
  maintainerFee: '523', // 5.23%,
  minStakingDuration: '864000',
  maintainer: '0xCbfad58eF43Ce8E9bD571f6913b701Ba27D1D3aC',
  withdrawalCredentials:
    '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4'
};

async function deploySettingsProxy({
  networkConfig,
  adminsProxy,
  operatorsProxy
}) {
  const proxy = await scripts.create({
    contractAlias: 'Settings',
    methodName: 'initialize',
    methodArgs: [
      initialSettings.maintainer,
      initialSettings.maintainerFee,
      initialSettings.minStakingDuration,
      initialSettings.userDepositMinUnit,
      initialSettings.validatorDepositAmount,
      initialSettings.withdrawalCredentials,
      adminsProxy,
      operatorsProxy
    ],
    ...networkConfig
  });

  log(`Settings contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deploySettingsProxy,
  initialSettings
};
