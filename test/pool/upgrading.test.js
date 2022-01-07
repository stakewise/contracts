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
  let pool, poolValidators, oracles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));
    ({ poolValidators, oracles } = await upgradeContracts());
    pool = await Pool.at(contracts.pool);
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      pool.upgrade(poolValidators, oracles, { from: sender }),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      pool.upgrade(poolValidators, oracles, { from: admin }),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await pool.pause({ from: admin });
    await expectRevert(
      pool.upgrade(poolValidators, oracles, { from: admin }),
      'Pool: invalid PoolValidators address'
    );
  });
});
