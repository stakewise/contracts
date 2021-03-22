const hre = require('hardhat');

let contracts, contractSettings;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contracts = {
    validators: '0xE2F13059454b626e42e04845815E9Ed2E9774bF3',
    oracles: '0xE54486fa4eB45716c5725d7A46FDDe810B8E8914',
    pool: '0x8c1EfEcFb5c4F1099AB0460b5659342943764Df7',
    solos: '0xcf809A020EE599034C010b387F2116237a5B22Bc',
    stakedEthToken: '0x221D9812823DBAb0F1fB40b0D294D9875980Ac19',
    rewardEthToken: '0x826f88d423440c305D9096cC1581Ae751eFCAfB0',
    proxyAdmin: '0xbba3f4dDD4F705aD2028ee2da64fF3166bDe8cA8',
  };
  contractSettings = {
    cancelLockDuration: '86400', // 1 day
    oraclesSyncPeriod: '86400', // 1 day
    validatorPrice: '10000000000000000000', // 10 DAI / month
    maintainerFee: '1000', // 10%,
    admin: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    maintainer: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    VRC: '0x8c5fecdC472E27Bc447696F431E425D02dd46a8c',
    withdrawalCredentials:
      '0x003e294ffc37978496f1b9298d5984ad4d55d4e2d1e6a06ee6904810c7b9e0d5',
    activatedValidators: '0',
    pendingValidators: '1',
    minActivatingDeposit: '5000000000000000000', // 5 ETH
    pendingValidatorsLimit: '500', // 5 %
  };
} else {
  contractSettings = {
    cancelLockDuration: '86400', // 1 day
    oraclesSyncPeriod: '86400', // 1 day
    validatorPrice: '10000000000000000000', // 10 DAI / month
    maintainerFee: '1000', // 10%,
    admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
    maintainer: '0xf91AA4a655B6F43243ed4C2853F3508314DaA2aB',
    VRC: '0x00000000219ab540356cbb839cbe05303d7705fa',
    withdrawalCredentials:
      '0x003e294ffc37978496f1b9298d5984ad4d55d4e2d1e6a06ee6904810c7b9e0d5',
    activatedValidators: '530',
    pendingValidators: '2',
    minActivatingDeposit: '32000000000000000000', // 32 ETH
    pendingValidatorsLimit: '500', // 5 %
  };

  contracts = {
    validators: '0xaAc73D4A26Ae6906aa115118b7840b1F19fcd3A5',
    oracles: '0x2f1C5E86B13a74f5A6E7B4b35DD77fe29Aa47514',
    pool: '0xC874b064f465bdD6411D45734b56fac750Cda29A',
    solos: '0xEadCBA8BF9ACA93F627F31fB05470F5A0686CEca',
    stakedEthToken: '0xFe2e637202056d30016725477c5da089Ab0A043A',
    rewardEthToken: '0x20BC832ca081b91433ff6c17f85701B6e92486c5',
    proxyAdmin: '0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22',
  };
}

module.exports = {
  contractSettings,
  contracts,
};
