const { expectRevert, send, ether } = require('@openzeppelin/test-helpers');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
} = require('../utils');

const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

contract('Oracles (upgrading)', ([anyone]) => {
  let admin = contractSettings.admin;
  let oracles, pool;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      oracles.upgrade(
        pool.address,
        contractSettings.depositsActivationEnabled,
        {
          from: anyone,
        }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      oracles.upgrade(
        pool.address,
        contractSettings.depositsActivationEnabled,
        {
          from: admin,
        }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await oracles.pause({ from: admin });
    await expectRevert(
      oracles.upgrade(
        pool.address,
        contractSettings.depositsActivationEnabled,
        {
          from: admin,
        }
      ),
      'Oracles: already upgraded'
    );
  });
});
