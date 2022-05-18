const hre = require('hardhat');
const { contractSettings, contracts } = require('../deployments/settings');

let proxies = [
  contracts.whiteListManager,
  contracts.roles,
  contracts.pool,
  contracts.poolValidators,
  contracts.rewardEthToken,
  contracts.stakedEthToken,
  contracts.merkleDistributor,
  contracts.oracles,
];

let implementations = [
  '0x35090bb49EC4B336aA3cd23410c4f60Ed4F7eDf2',
  '0x246568d4e637f90321CDE83600582f6f7204a2aC',
  '0xea75a7efB541D0ed115a29F8Df827D9dFcD28c15',
  '0xed04369Cf09298050c92250aDed922fFDA9edc4E',
  '0xDBeB6bE4fCDa92022bF8613342F58B9368741c54',
  '0x353BFea1B119B4A8299F313E9643A9772AbCeC38',
  '0xD24F252E92d0E2AC83d360Ec918D0a76Fd9B78Ee',
  '0xa533E254914849Ab79d78F30B78Ac3C660a97c3E',
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
