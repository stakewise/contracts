const hre = require('hardhat');

let contracts, contractSettings;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contracts = {
    validators: '0xd44F2fB4278A9d7dc87f8a3e23551201F1880980',
    oracles: '0x198F275E5fB485AB77B5680fbCD271d5c6B06bdE',
    pool: '0x6B6C66BEd8dbF7fAD433F07ed956389d228d8Dd8',
    solos: '0x95f9CaF170e7D6b2294d417d41CbB1eD7870f873',
    stakedEthToken: '0x74588F7a385f0A64473FC609d2d78357F8694F8C',
    rewardEthToken: '0xE3b2145f6a1e62cDe0451B0Db3f64705Bd8E3317',
    proxyAdmin: '0x8Dfc8A188dCbf1bd7A1226340510593F3Ae11a78',
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
    activationDuration: '432000', // 5 days
    totalStakingAmount: '10624000000000000000000', // 32 ETH
    minActivatingDeposit: '5000000000000000000', // 5 ETH
    minActivatingShare: '500', // 5 %
    depositsActivationEnabled: true,
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
    activationDuration: '432000', // 5 days
    totalStakingAmount: '10624000000000000000000', // 320 ETH
    minActivatingDeposit: '5000000000000000000', // 5 ETH
    minActivatingShare: '500', // 5 %
    depositsActivationEnabled: true,
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
