const { expect } = require('chai');
const {
  expectEvent,
  expectRevert,
  send,
  ether,
  constants,
} = require('@openzeppelin/test-helpers');
const { contractSettings } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('./utils');
const { upgradeContracts } = require('../deployments');

const WhiteListManager = artifacts.require('WhiteListManager');

contract('WhiteListManager', (accounts) => {
  let [manager, anyone] = accounts;
  const admin = contractSettings.admin;
  let whiteListManager;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    whiteListManager = await WhiteListManager.at(
      upgradedContracts.whiteListManager
    );
  });

  afterEach(async () => resetFork());

  describe('assigning managers', () => {
    it('admins can assign manager role to another account', async () => {
      const receipt = await whiteListManager.addManager(anyone, {
        from: admin,
      });
      expect(await whiteListManager.isManager(anyone)).equal(true);
      expectEvent(receipt, 'RoleGranted', {
        role: await whiteListManager.MANAGER_ROLE(),
        account: anyone,
        sender: admin,
      });
    });

    it('others cannot assign manager role to an account', async () => {
      await expectRevert(
        whiteListManager.addManager(anyone, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
    });

    it('managers cannot assign manager role to others', async () => {
      await whiteListManager.addManager(manager, { from: admin });
      await expectRevert(
        whiteListManager.addManager(anyone, { from: manager }),
        'AccessControl: sender must be an admin to grant'
      );
    });
  });

  describe('removing managers', () => {
    beforeEach(async () => {
      await whiteListManager.addManager(manager, { from: admin });
    });

    it('anyone cannot remove managers', async () => {
      await expectRevert(
        whiteListManager.removeManager(manager, { from: anyone }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await whiteListManager.isManager(manager)).equal(true);
    });

    it('manager cannot remove other managers', async () => {
      await whiteListManager.addManager(anyone, { from: admin });
      await expectRevert(
        whiteListManager.removeManager(anyone, { from: manager }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await whiteListManager.isManager(manager)).equal(true);
      expect(await whiteListManager.isManager(anyone)).equal(true);
    });

    it('admins can remove managers', async () => {
      const receipt = await whiteListManager.removeManager(manager, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await whiteListManager.MANAGER_ROLE(),
        account: manager,
        sender: admin,
      });
      expect(await whiteListManager.isManager(manager)).equal(false);
    });
  });

  describe('whitelist update', () => {
    beforeEach(async () => {
      await whiteListManager.addManager(manager, { from: admin });
    });

    it('cannot update whitelist when paused', async () => {
      await whiteListManager.pause({ from: admin });
      await expectRevert(
        whiteListManager.updateWhiteList(anyone, true, { from: manager }),
        'Pausable: paused'
      );
    });

    it('cannot update whitelist with invalid account', async () => {
      await expectRevert(
        whiteListManager.updateWhiteList(constants.ZERO_ADDRESS, true, {
          from: manager,
        }),
        'WhiteListManager: invalid account address'
      );
    });

    it('anyone cannot update whitelist', async () => {
      await expectRevert(
        whiteListManager.updateWhiteList(anyone, true, {
          from: anyone,
        }),
        'WhiteListManager: access denied'
      );
      expect(await whiteListManager.isManager(manager)).equal(true);
    });

    it('manager can update whitelist', async () => {
      let receipt = await whiteListManager.updateWhiteList(anyone, true, {
        from: manager,
      });
      expectEvent(receipt, 'WhiteListUpdated', {
        account: anyone,
        approved: true,
      });
      receipt = await whiteListManager.updateWhiteList(anyone, false, {
        from: manager,
      });
      expectEvent(receipt, 'WhiteListUpdated', {
        account: anyone,
        approved: false,
      });
    });
  });
});
