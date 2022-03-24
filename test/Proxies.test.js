const hre = require('hardhat');
const { contractSettings, contracts } = require('../deployments/settings');

let proxies = [
  contracts.pool,
  contracts.poolValidators,
  contracts.oracles,
  contracts.stakedToken,
  contracts.rewardToken,
  contracts.merkleDistributor,
  contracts.roles,
];

let implementations = [
  '0xcA43380E7f73FADbF56a0b91420381350B911f5B',
  '0x2E9acE6Ae7281fBF19b0401609CE64536Fc924B5',
  '0xDA5dF5E0b44E80AB356708E35970C193ce04c7c1',
  '0xFb7848790A4eC81E2404a279315a4d44C16125B1',
  '0x052b1e04f490518004f472B6e4f1053289403645',
  '0x4c63cdf87cDc21971A75F859903355Bed7D3EF01',
  '0x6b333B20fBae3c5c0969dd02176e30802e2fbBdB',
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
