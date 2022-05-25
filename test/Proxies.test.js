const hre = require('hardhat');
const { contractSettings, contracts } = require('../deployments/settings');

let proxies = [
  contracts.pool,
  contracts.poolValidators,
  contracts.oracles,
  contracts.stakedEthToken,
  contracts.rewardEthToken,
  contracts.stakeWiseToken,
  contracts.vestingEscrowFactory,
  contracts.merkleDistributor,
  contracts.roles,
];

let implementations = [
  '0xe68E649862F7036094f1E4eD5d69a738aCDE666f',
  '0xfa00515082fe90430C80DA9B299f353929653d7B',
  '0xfc9B67b6034F6B306EA9Bd8Ec1baf3eFA2490394',
  '0x41bcac23e4db058d8D7aAbE2Fccdae5F01FE647A',
  '0x7cA75ccf264b2d9F91D4ABA7639fC7FcC73a7e09',
  '0xA28C2d79f0c5B78CeC699DAB0303008179815396',
  '0xbeE3Eb97Cfd94ace6B66E606B8088C57c5f78fBf',
  '0x1d873651c38D912c8A7E1eBfB013Aa96bE5AACBC',
  '0x584E5D4bD0AE1EEF838796aEe8fb805BbB82439C',
];

contract('Proxies', () => {
  let proxyAdmin;

  beforeEach(async () => {
    proxyAdmin = await hre.upgrades.admin.getInstance();
  });

  it('proxy admin is set correctly', async () => {
    for (const proxy of proxies) {
      expect(await proxyAdmin.getProxyAdmin(proxy)).to.equal(
        proxyAdmin.address
      );
    }
  });

  it('proxy implementation is correct', async () => {
    for (let i = 0; i < proxies.length; i++) {
      expect(await proxyAdmin.getProxyImplementation(proxies[i])).to.equal(
        implementations[i]
      );
    }
  });

  it('proxy admin owner is DAO', async () => {
    expect(await proxyAdmin.owner()).to.equal(contractSettings.admin);
  });
});
