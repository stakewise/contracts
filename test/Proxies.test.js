const hre = require('hardhat');
const { contractSettings, contracts } = require('../deployments/settings');

let proxies = [
  contracts.oracles,
  contracts.pool,
  contracts.poolValidators,
  contracts.stakedEthToken,
  contracts.rewardEthToken,
  contracts.stakeWiseToken,
  contracts.vestingEscrowFactory,
  contracts.merkleDistributor,
  contracts.roles,
];

let implementations = [
  '0x1cFcF1893326844270ec077fe996C785EFDed4B1',
  '0xc8970E7C07c251625F9F93cE510b1D9c1a08d299',
  '0xD420f9BE4cd6c96993fd940EF13110746AE48abC',
  '0x41bcac23e4db058d8D7aAbE2Fccdae5F01FE647A',
  '0x610B58583642610967727fe4fadd125a92D6F678',
  '0xA28C2d79f0c5B78CeC699DAB0303008179815396',
  '0xbeE3Eb97Cfd94ace6B66E606B8088C57c5f78fBf',
  '0x459beef3c5Bd5D1E66de93AC908E278ee2488F14',
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
