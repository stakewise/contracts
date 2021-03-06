const { expectRevert } = require('@openzeppelin/test-helpers');
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
  let oracles, pool;

  after(async () => stopImpersonatingAccount(contractSettings.admin));

  beforeEach(async () => {
    await impersonateAccount(contractSettings.admin);
    await upgradeContracts();

    oracles = await Oracles.at(contracts.oracles);
    pool = await Pool.at(contracts.pool);
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      oracles.initialize(
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
      oracles.initialize(
        pool.address,
        contractSettings.depositsActivationEnabled,
        {
          from: contractSettings.admin,
        }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await oracles.pause({ from: contractSettings.admin });
    await expectRevert(
      oracles.initialize(
        pool.address,
        contractSettings.depositsActivationEnabled,
        {
          from: contractSettings.admin,
        }
      ),
      'Oracles: already initialized'
    );
  });
});
