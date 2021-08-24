const { send, ether } = require('@openzeppelin/test-helpers');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
} = require('../utils');

const Oracles = artifacts.require('Oracles');
const PrevOracles = artifacts.require('IPrevOracles');

contract('Oracles (upgrading)', ([anyone]) => {
  let admin = contractSettings.admin;
  let oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));
    let upgradedContracts = await upgradeContracts();
    oracles = await Oracles.at(upgradedContracts.oracles);
  });

  afterEach(async () => resetFork());

  it('initializes with values from previous contract', async () => {
    let prevOracles = await PrevOracles.at(contracts.oracles);
    expect(await prevOracles.currentNonce()).to.bignumber.equal(
      await oracles.currentRewardsNonce()
    );

    prevOracles = await Oracles.at(contracts.oracles);
    let oraclesRole = await oracles.ORACLE_ROLE();
    let totalOracles = await oracles.getRoleMemberCount(oraclesRole);
    expect(totalOracles).to.bignumber.equal(
      await prevOracles.getRoleMemberCount(oraclesRole)
    );

    for (let i = 0; i < totalOracles.toNumber(); i++) {
      let oldOracle = await prevOracles.getRoleMember(oraclesRole, i);
      let newOracle = await oracles.getRoleMember(oraclesRole, i);
      expect(oldOracle).to.equal(newOracle);
    }
  });
});
