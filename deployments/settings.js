const initialSettings = {
  cancelLockDuration: '86400', // 1 day
  totalRewardsUpdatePeriod: '86400', // 1 day
  validatorPrice: '10000000000000000000', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0x08C96cfD285D039EdEB1a7c5CaF9ef0D0EE38c52',
  maintainer: '0xa01A6D6dea4e32Aa2E24f7e671d4eaC07AE3a8E8',
  VRC: '0x00000000219ab540356cbb839cbe05303d7705fa',
  // TODO: update to mainnet withdrawal credentials
  withdrawalCredentials:
    '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4',
};

module.exports = {
  initialSettings,
};
