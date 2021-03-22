const { expect } = require('chai');
const { expectRevert, send, ether } = require('@openzeppelin/test-helpers');
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
    await send.ether(sender, admin, ether('5'));
    await upgradeContracts();
    pool = await Pool.at(contracts.pool);

    expect(await pool.activatedValidators()).to.bignumber.equal(
      contractSettings.activatedValidators
    );
    expect(await pool.pendingValidatorsLimit()).to.bignumber.equal(
      contractSettings.pendingValidatorsLimit
    );
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      pool.upgrade(
        contracts.oracles,
        contractSettings.activatedValidators,
        contractSettings.pendingValidators,
        contractSettings.minActivatingDeposit,
        contractSettings.pendingValidatorsLimit,
        { from: sender }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      pool.upgrade(
        contracts.oracles,
        contractSettings.activatedValidators,
        contractSettings.pendingValidators,
        contractSettings.minActivatingDeposit,
        contractSettings.pendingValidatorsLimit,
        { from: admin }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await pool.pause({ from: admin });
    await expectRevert(
      pool.upgrade(
        contracts.oracles,
        contractSettings.activatedValidators,
        contractSettings.pendingValidators,
        contractSettings.minActivatingDeposit,
        contractSettings.pendingValidatorsLimit,
        { from: admin }
      ),
      'Pool: already upgraded'
    );
  });
});
