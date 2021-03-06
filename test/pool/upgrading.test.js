const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const Pool = artifacts.require('Pool');

contract('Pool (upgrading)', ([sender]) => {
  const admin = contractSettings.admin;
  let pool;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await upgradeContracts();
    pool = await Pool.at(contracts.pool);

    expect(await pool.activationDuration()).to.bignumber.equal(
      contractSettings.activationDuration
    );
    expect(await pool.minActivatingDeposit()).to.bignumber.equal(
      contractSettings.minActivatingDeposit
    );
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      pool.initialize(
        contracts.oracles,
        contractSettings.activationDuration,
        contractSettings.beaconActivatingAmount,
        contractSettings.minActivatingDeposit,
        contractSettings.minActivatingShare,
        { from: sender }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      pool.initialize(
        contracts.oracles,
        contractSettings.activationDuration,
        contractSettings.beaconActivatingAmount,
        contractSettings.minActivatingDeposit,
        contractSettings.minActivatingShare,
        { from: admin }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await pool.pause({ from: admin });
    await expectRevert(
      pool.initialize(
        contracts.oracles,
        contractSettings.activationDuration,
        contractSettings.beaconActivatingAmount,
        contractSettings.minActivatingDeposit,
        contractSettings.minActivatingShare,
        { from: admin }
      ),
      'Pool: already initialized'
    );
  });
});
