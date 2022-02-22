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
  '0xB5230EBE5b1a9299A5C44f459ED2E8EB7496F581',
  '0x822f08EaAf73156fe255D49827D048b8Ef7B86B2',
  '0x6000ABeE0c1a1FcB755c0306f83776F04947e72E',
  '0xDaDa6461Fd59E793085B5D9F282825bcEd72Af53',
  '0x04f439c341221Da7AE086b6F585e4Cd7a7E54622',
  '0xCcCe9Ddb87B57b589b6208fF14714cd44e4f330D',
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
