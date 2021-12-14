const hre = require('hardhat');

let contracts, contractSettings;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contracts = {
    oracles: '0x06b0C9476315634dCc59AA3F3f7d5Df6feCbAa90',
    pool: '0x8c1EfEcFb5c4F1099AB0460b5659342943764Df7',
    poolValidators: '0x0d92156861a0BC7037cC21470327Bd3Bc750EB1D',
    poolEscrow: '0x040F15C6b5Bfc5F324eCaB5864C38D4e1EEF4218',
    stakedEthToken: '0x221D9812823DBAb0F1fB40b0D294D9875980Ac19',
    rewardEthToken: '0x826f88d423440c305D9096cC1581Ae751eFCAfB0',
    stakeWiseToken: '0x0e2497aACec2755d831E4AFDEA25B4ef1B823855',
    vestingEscrowFactory: '0xbA91cdD484893c1f8F75DB55733ccaDcd0fE5f59',
    merkleDrop: '0xFc3513E92799F0169e5f14F354d0097E4b790498',
    merkleDistributor: '0x6Ef0172b79131C66c7012Db3545D637B116feb12',
    roles: '0x3ae8a774CFBBE305520A4a3Be3A480701B66aFba',
    contractChecker: '0x85ee326f839Bc430655A3fad447837072ef52C2F',
    proxyAdmin: '0xbba3f4dDD4F705aD2028ee2da64fF3166bDe8cA8',
  };

  contractSettings = {
    admin: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    vestingEscrow: '0x4CDAe3f1Eaa84b88fFc97627Ef1c77F762794287',
  };
} else {
  contracts = {
    prevOracles: '0x2f1C5E86B13a74f5A6E7B4b35DD77fe29Aa47514',
    oracles: '0xE949060ACE386D5e277De217703B17A2547f24C0',
    pool: '0xC874b064f465bdD6411D45734b56fac750Cda29A',
    poolValidators: '0x0e75786cB831bEE6d4484031Af12490Ab528c770',
    poolEscrow: '0x2296e122c1a20Fca3CAc3371357BdAd3be0dF079',
    stakedEthToken: '0xFe2e637202056d30016725477c5da089Ab0A043A',
    rewardEthToken: '0x20BC832ca081b91433ff6c17f85701B6e92486c5',
    stakeWiseToken: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
    vestingEscrowFactory: '0x7B910cc3D4B42FEFF056218bD56d7700E4ea7dD5',
    merkleDrop: '0x2AAB6822a1a9f982fd7b0Fe35A5A5b6148eCf4d5',
    merkleDistributor: '0xA3F21010e8b9a3930996C8849Df38f9Ca3647c20',
    roles: '0xC486c10e3611565F5b38b50ad68277b11C889623',
    contractChecker: '0xFC1fC7257AEA7C7c08A498594DCA97CE5A72fdCB',
    proxyAdmin: '0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22',
  };

  contractSettings = {
    admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
    vestingEscrow: '0x1E6d872CE26C8711e7D47b8E0C47aB91d95a6dF3',
  };
}

module.exports = {
  contractSettings,
  contracts,
};
