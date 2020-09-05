const { scripts } = require('@openzeppelin/cli');

const initialSettings = {
  minDepositUnit: '1000000000000000', // 0.001 ETH
  maxDepositAmount: '1000000000000000000000', // 1000 ETH
  validatorDepositAmount: '32000000000000000000', // 32 ETH
  validatorPrice: '3805175038051', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  allContractsPaused: false,
  // TODO: fix after implementing oracle
  validatorsOracle: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  DAIToken: '0x6b175474e89094c44da98b954eedeac495271d0f',
  // TODO: update to mainnet address
  VRC: '0x07b39F4fDE4A38bACe212b546dAc87C58DfE3fDC',
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
      initialSettings.minDepositUnit,
      initialSettings.validatorDepositAmount,
      initialSettings.maxDepositAmount,
      initialSettings.validatorPrice,
      initialSettings.allContractsPaused,
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
