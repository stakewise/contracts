const hre = require('hardhat');
const { contractSettings, contracts } = require('../deployments/settings');

let proxies = [
  contracts.pool,
  contracts.validators,
  contracts.stakedEthToken,
  contracts.rewardEthToken,
  contracts.oracles,
];

let implementations = [
  '0xc8970E7C07c251625F9F93cE510b1D9c1a08d299',
  '0xa34E1010E2b76abdf7399E6C88147D0FAfE28e90',
  '0x6A8a1716a44f700af56ea52D44B916A50333A369',
  '0x46B7232bc7392b157371eBFcD4618Ca9CEedb1bd',
  '0x749dCCE12E8337dfb44635082519E656d44A2672',
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

  it('proxy admin admin owner is DAO', async () => {
    expect(await proxyAdmin.owner()).to.equal(contractSettings.admin);
  });
});
