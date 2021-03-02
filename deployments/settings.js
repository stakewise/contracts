const initialSettings = {
  cancelLockDuration: '86400', // 1 day
  oraclesSyncPeriod: '86400', // 1 day
  validatorPrice: '10000000000000000000', // 10 DAI / month
  maintainerFee: '1000', // 10%,
  admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
  maintainer: '0xf91AA4a655B6F43243ed4C2853F3508314DaA2aB',
  VRC: '0x00000000219ab540356cbb839cbe05303d7705fa',
  withdrawalCredentials:
    '0x003e294ffc37978496f1b9298d5984ad4d55d4e2d1e6a06ee6904810c7b9e0d5',
  activationDuration: '432000', // 5 days
  beaconActivatingAmount: '320000000000000000000', // 320 ETH
  minActivatingDeposit: '5000000000000000000', // 5 ETH
  minActivatingShare: '50000000000000000', // 5 %
  depositsActivationEnabled: true,
};

module.exports = {
  initialSettings,
};
