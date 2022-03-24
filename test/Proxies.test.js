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
  '0x2e9ace6ae7281fbf19b0401609ce64536fc924b5',
  '0xda5df5e0b44e80ab356708e35970c193ce04c7c1',
  '0xfb7848790a4ec81e2404a279315a4d44c16125b1',
  '0x052b1e04f490518004f472b6e4f1053289403645',
  '0x4c63cdf87cdc21971a75f859903355bed7d3ef01',
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
