let contractSettings = {
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
  totalStakingAmount: '10624000000000000000000', // 320 ETH
  minActivatingDeposit: '5000000000000000000', // 5 ETH
  minActivatingShare: '500', // 5 %
  depositsActivationEnabled: true,
};

let contracts = {
  validators: '0xaAc73D4A26Ae6906aa115118b7840b1F19fcd3A5',
  oracles: '0x2f1C5E86B13a74f5A6E7B4b35DD77fe29Aa47514',
  pool: '0xC874b064f465bdD6411D45734b56fac750Cda29A',
  solos: '0xEadCBA8BF9ACA93F627F31fB05470F5A0686CEca',
  stakedEthToken: '0xFe2e637202056d30016725477c5da089Ab0A043A',
  rewardEthToken: '0x20BC832ca081b91433ff6c17f85701B6e92486c5',
  proxyAdmin: '0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22',
};

module.exports = {
  contractSettings,
  contracts,
};
