const { expect } = require('chai');
const { expectRevert, send, ether } = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');

const VestingEscrowFactory = artifacts.require('VestingEscrowFactory');

contract('VestingEscrowFactory (upgrading)', ([vestingEscrow, anyone]) => {
  const admin = contractSettings.admin;
  let vestingEscrowFactory;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let contracts = await upgradeContracts();
    vestingEscrowFactory = await VestingEscrowFactory.at(
      contracts.vestingEscrowFactory
    );
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      vestingEscrowFactory.upgrade(vestingEscrow, { from: anyone }),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      vestingEscrowFactory.upgrade(vestingEscrow, { from: admin }),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await vestingEscrowFactory.pause({ from: admin });
    await expectRevert(
      vestingEscrowFactory.upgrade(contractSettings.vestingEscrow, {
        from: admin,
      }),
      'VestingEscrowFactory: already upgraded'
    );
  });
});
