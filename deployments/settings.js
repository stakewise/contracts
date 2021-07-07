const hre = require('hardhat');

let contracts, contractSettings;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contracts = {
    validators: '0xE2F13059454b626e42e04845815E9Ed2E9774bF3',
    oracles: '0xE54486fa4eB45716c5725d7A46FDDe810B8E8914',
    pool: '0x8c1EfEcFb5c4F1099AB0460b5659342943764Df7',
    poolEscrow: '0x040F15C6b5Bfc5F324eCaB5864C38D4e1EEF4218',
    solos: '0xcf809A020EE599034C010b387F2116237a5B22Bc',
    stakedEthToken: '0x221D9812823DBAb0F1fB40b0D294D9875980Ac19',
    rewardEthToken: '0x826f88d423440c305D9096cC1581Ae751eFCAfB0',
    stakeWiseToken: '0x0e2497aACec2755d831E4AFDEA25B4ef1B823855',
    vestingEscrowFactory: '0xbA91cdD484893c1f8F75DB55733ccaDcd0fE5f59',
    merkleDrop: '0xFc3513E92799F0169e5f14F354d0097E4b790498',
    merkleDistributor: '0x6Ef0172b79131C66c7012Db3545D637B116feb12',
    proxyAdmin: '0xbba3f4dDD4F705aD2028ee2da64fF3166bDe8cA8',
  };

  contractSettings = {
    cancelLockDuration: '86400', // 1 day
    syncPeriod: '6646', // 1 day in blocks
    totalRewardsLastUpdateBlockNumber: '4821781', // total rewards last update block number
    validatorPrice: '10000000000000000000', // 10 DAI / month
    maintainerFee: '1000', // 10%,
    admin: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    solosAdmin: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    maintainer: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    VRC: '0x8c5fecdC472E27Bc447696F431E425D02dd46a8c',
    vestingEscrow: '0x4CDAe3f1Eaa84b88fFc97627Ef1c77F762794287',
    withdrawalCredentials:
      '0x003e294ffc37978496f1b9298d5984ad4d55d4e2d1e6a06ee6904810c7b9e0d5',
    activatedValidators: '0',
    pendingValidators: '1',
    minActivatingDeposit: '5000000000000000000', // 5 ETH
    pendingValidatorsLimit: '500', // 5 %

    // SWISE staking
    multipliers: {
      103: 2592000,
      110: 7776000,
      130: 15552000,
      200: 31104000,
      500: 93312000,
    },
  };
} else {
  contracts = {
    validators: '0xaAc73D4A26Ae6906aa115118b7840b1F19fcd3A5',
    oracles: '0x2f1C5E86B13a74f5A6E7B4b35DD77fe29Aa47514',
    pool: '0xC874b064f465bdD6411D45734b56fac750Cda29A',
    poolEscrow: '0x2296e122c1a20Fca3CAc3371357BdAd3be0dF079',
    solos: '0xEadCBA8BF9ACA93F627F31fB05470F5A0686CEca',
    stakedEthToken: '0xFe2e637202056d30016725477c5da089Ab0A043A',
    rewardEthToken: '0x20BC832ca081b91433ff6c17f85701B6e92486c5',
    stakeWiseToken: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
    vestingEscrowFactory: '0x7B910cc3D4B42FEFF056218bD56d7700E4ea7dD5',
    merkleDrop: '0x2AAB6822a1a9f982fd7b0Fe35A5A5b6148eCf4d5',
    merkleDistributor: '0xA3F21010e8b9a3930996C8849Df38f9Ca3647c20',
    proxyAdmin: '0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22',
  };

  contractSettings = {
    cancelLockDuration: '86400', // 1 day
    syncPeriod: '6646', // 1 day in blocks
    totalRewardsLastUpdateBlockNumber: '12653584', // total rewards last update block number
    validatorPrice: '10000000000000000000', // 10 DAI / month
    maintainerFee: '1000', // 10%,
    admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
    solosAdmin: '0xf91AA4a655B6F43243ed4C2853F3508314DaA2aB',
    maintainer: '0xf91AA4a655B6F43243ed4C2853F3508314DaA2aB',
    VRC: '0x00000000219ab540356cbb839cbe05303d7705fa',
    vestingEscrow: '0x1E6d872CE26C8711e7D47b8E0C47aB91d95a6dF3',
    withdrawalCredentials:
      '0x0100000000000000000000002296e122c1a20fca3cac3371357bdad3be0df079',
    activatedValidators: '798',
    pendingValidators: '5',
    minActivatingDeposit: '32000000000000000000', // 32 ETH
    pendingValidatorsLimit: '500', // 5 %

    // SWISE staking
    multipliers: {
      103: 2592000,
      110: 7776000,
      130: 15552000,
      200: 31104000,
      500: 93312000,
    },
  };
}

module.exports = {
  contractSettings,
  contracts,
};
