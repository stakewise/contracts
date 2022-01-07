const {
  expectRevert,
  expectEvent,
  ether,
  send,
  BN,
  constants,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../deployments');
const { contractSettings } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('./utils');

const Roles = artifacts.require('Roles');

contract('Roles', ([anyone, operator, partner]) => {
  const admin = contractSettings.admin;
  let revenueShare = new BN(3000);
  let roles;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    roles = await Roles.at(upgradedContracts.roles);
  });

  afterEach(async () => resetFork());

  describe('operators', () => {
    it('not admin fails to set operator', async () => {
      await expectRevert(
        roles.setOperator(operator, revenueShare, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to set operator to zero address', async () => {
      await expectRevert(
        roles.setOperator(constants.ZERO_ADDRESS, revenueShare, {
          from: admin,
        }),
        'Roles: account is the zero address'
      );
    });

    it('fails to set operator with invalid revenue share', async () => {
      await expectRevert(
        roles.setOperator(operator, new BN(10001), {
          from: admin,
        }),
        'Roles: invalid revenue share'
      );
    });

    it('fails to set operator when paused', async () => {
      await roles.pause({ from: admin });
      await expectRevert(
        roles.setOperator(operator, revenueShare, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('admin can set operator', async () => {
      let receipt = await roles.setOperator(operator, revenueShare, {
        from: admin,
      });
      await expectEvent(receipt, 'OperatorUpdated', {
        operator,
        revenueShare,
      });
    });

    it('fails to remove zero address operator', async () => {
      await expectRevert(
        roles.removeOperator(constants.ZERO_ADDRESS, {
          from: admin,
        }),
        'Roles: account is the zero address'
      );
    });

    it('fails to remove operator when paused', async () => {
      await roles.pause({ from: admin });
      await expectRevert(
        roles.removeOperator(operator, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });
  });

  describe('partners', () => {
    it('not admin fails to set partner', async () => {
      await expectRevert(
        roles.setPartner(partner, revenueShare, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('fails to set partner to zero address', async () => {
      await expectRevert(
        roles.setPartner(constants.ZERO_ADDRESS, revenueShare, {
          from: admin,
        }),
        'Roles: account is the zero address'
      );
    });

    it('fails to set partner with invalid revenue share', async () => {
      await expectRevert(
        roles.setPartner(partner, new BN(10001), {
          from: admin,
        }),
        'Roles: invalid revenue share'
      );
    });

    it('fails to set partner when paused', async () => {
      await roles.pause({ from: admin });
      await expectRevert(
        roles.setPartner(partner, revenueShare, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });

    it('admin can set partner', async () => {
      let receipt = await roles.setPartner(partner, revenueShare, {
        from: admin,
      });
      await expectEvent(receipt, 'PartnerUpdated', {
        partner,
        revenueShare,
      });
    });

    it('fails to remove zero address partner', async () => {
      await expectRevert(
        roles.removePartner(constants.ZERO_ADDRESS, {
          from: admin,
        }),
        'Roles: account is the zero address'
      );
    });

    it('fails to remove partner when paused', async () => {
      await roles.pause({ from: admin });
      await expectRevert(
        roles.removePartner(partner, {
          from: admin,
        }),
        'Pausable: paused'
      );
    });
  });
});
