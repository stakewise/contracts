const { expect } = require('chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

function ownablePausableTests({ getOwnableContract, accounts }) {
  let ownableContract;
  let [admin, otherAdmin, pauser, otherPauser, anyone] = accounts;

  beforeEach(async () => {
    ownableContract = await getOwnableContract(admin);
  });

  describe('assigning admins', () => {
    it('admins can assign admin role to another account', async () => {
      const receipt = await ownableContract.addAdmin(otherAdmin, {
        from: admin,
      });
      expect(await ownableContract.isAdmin(admin)).equal(true);
      expectEvent(receipt, 'RoleGranted', {
        role: await ownableContract.DEFAULT_ADMIN_ROLE(),
        account: otherAdmin,
        sender: admin,
      });
      expect(await ownableContract.isAdmin(otherAdmin)).equal(true);
      expect(await ownableContract.isAdmin(anyone)).equal(false);
    });

    it('anyone cannot assign admin role to an account', async () => {
      await expectRevert(
        ownableContract.addAdmin(otherAdmin, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await ownableContract.isAdmin(otherAdmin)).equal(false);
      expect(await ownableContract.isAdmin(anyone)).equal(false);
    });
  });

  describe('removing admins', () => {
    it('admin can remove himself', async () => {
      let adminRole = await ownableContract.DEFAULT_ADMIN_ROLE();
      const receipt = await ownableContract.renounceRole(adminRole, admin, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: adminRole,
        account: admin,
        sender: admin,
      });
      expect(await ownableContract.isAdmin(admin)).equal(false);
    });

    it('admin can remove other admins', async () => {
      await ownableContract.addAdmin(otherAdmin, {
        from: admin,
      });
      expect(await ownableContract.isAdmin(otherAdmin)).equal(true);

      const receipt = await ownableContract.removeAdmin(otherAdmin, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await ownableContract.DEFAULT_ADMIN_ROLE(),
        account: otherAdmin,
        sender: admin,
      });
      expect(await ownableContract.isAdmin(otherAdmin)).equal(false);
    });
  });

  describe('assigning pausers', () => {
    it('admin can assign pauser role to another account', async () => {
      const receipt = await ownableContract.addPauser(pauser, {
        from: admin,
      });
      expectEvent(receipt, 'RoleGranted', {
        role: await ownableContract.PAUSER_ROLE(),
        account: pauser,
        sender: admin,
      });
      expect(await ownableContract.isPauser(pauser)).equal(true);
      expect(await ownableContract.isPauser(admin)).equal(true);
      expect(await ownableContract.isPauser(anyone)).equal(false);
    });

    it('others cannot assign pauser role to an account', async () => {
      await expectRevert(
        ownableContract.addPauser(pauser, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await ownableContract.isPauser(pauser)).equal(false);
      expect(await ownableContract.isPauser(anyone)).equal(false);
    });

    it('pausers cannot assign pauser role to others', async () => {
      await ownableContract.addPauser(pauser, { from: admin });
      await expectRevert(
        ownableContract.addPauser(otherPauser, { from: pauser }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await ownableContract.isPauser(pauser)).equal(true);
      expect(await ownableContract.isPauser(otherPauser)).equal(false);
    });
  });

  describe('removing pausers', () => {
    beforeEach(async () => {
      await ownableContract.addPauser(pauser, { from: admin });
      await ownableContract.addPauser(otherPauser, { from: admin });
    });

    it('anyone cannot remove pausers', async () => {
      await expectRevert(
        ownableContract.removePauser(pauser, { from: anyone }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await ownableContract.isPauser(pauser)).equal(true);
      expect(await ownableContract.isPauser(otherPauser)).equal(true);
    });

    it('pauser cannot remove other pausers', async () => {
      await expectRevert(
        ownableContract.removePauser(otherPauser, { from: pauser }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await ownableContract.isPauser(pauser)).equal(true);
      expect(await ownableContract.isPauser(otherPauser)).equal(true);
    });

    it('admins can remove pausers', async () => {
      const receipt = await ownableContract.removePauser(pauser, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await ownableContract.PAUSER_ROLE(),
        account: pauser,
        sender: admin,
      });
      expect(await ownableContract.isPauser(pauser)).equal(false);
      expect(await ownableContract.isPauser(otherPauser)).equal(true);
    });
  });

  describe('pausing', () => {
    beforeEach(async () => {
      await ownableContract.addPauser(pauser, { from: admin });
    });

    it('pauser can pause contract', async () => {
      const receipt = await ownableContract.pause({ from: pauser });
      expectEvent(receipt, 'Paused', {
        account: pauser,
      });
      expect(await ownableContract.paused()).equal(true);
    });

    it('pauser can unpause contract', async () => {
      await ownableContract.pause({ from: pauser });
      const receipt = await ownableContract.unpause({ from: pauser });
      expectEvent(receipt, 'Unpaused', {
        account: pauser,
      });
      expect(await ownableContract.paused()).equal(false);
    });

    it('others cannot pause contract', async () => {
      await expectRevert(
        ownableContract.pause({ from: anyone }),
        'OwnablePausable: access denied'
      );
      expect(await ownableContract.paused()).equal(false);
    });

    it('others cannot unpause contract', async () => {
      await ownableContract.pause({ from: pauser });
      await expectRevert(
        ownableContract.unpause({ from: anyone }),
        'OwnablePausable: access denied'
      );
      expect(await ownableContract.paused()).equal(true);
    });
  });
}

module.exports = {
  ownablePausableTests,
};
