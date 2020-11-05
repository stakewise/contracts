const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { deployAndInitializeAdmins } = require('../../deployments/access');

const Admins = artifacts.require('Admins');

contract('Admins', ([_, ...accounts]) => {
  let admins;
  let [admin, otherAdmin, anyone] = accounts;

  beforeEach(async () => {
    admins = await Admins.at(await deployAndInitializeAdmins(admin));
  });

  it('assigns admin on initialization', async () => {
    let admins = await Admins.new();
    const receipt = await admins.initialize(admin);
    expect(await admins.isAdmin(admin)).equal(true);
    expectEvent(receipt, 'AdminAdded', {
      account: admin,
    });
  });

  describe('assigning', () => {
    it('admins can assign admin role to another account', async () => {
      const receipt = await admins.addAdmin(otherAdmin, { from: admin });
      expectEvent(receipt, 'AdminAdded', {
        account: otherAdmin,
      });
      expect(await admins.isAdmin(otherAdmin)).equal(true);
      expect(await admins.isAdmin(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        admins.addAdmin(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned admin role multiple times', async () => {
      await admins.addAdmin(otherAdmin, { from: admin });
      expect(await admins.isAdmin(otherAdmin)).equal(true);

      // try assigning second time
      await expectRevert(
        admins.addAdmin(otherAdmin, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('anyone cannot assign admin role to an account', async () => {
      await expectRevert(
        admins.addAdmin(otherAdmin, { from: anyone }),
        'Admins: caller does not have an admin role'
      );
      expect(await admins.isAdmin(otherAdmin)).equal(false);
      expect(await admins.isAdmin(anyone)).equal(false);
    });
  });

  describe('renouncing', () => {
    it('admin can renounce himself', async () => {
      const receipt = await admins.renounceAdmin({ from: admin });
      expectEvent(receipt, 'AdminRemoved', {
        account: admin,
      });
      expect(await admins.isAdmin(admin)).equal(false);
    });

    it('others cannot renounce themselves', async () => {
      await expectRevert(
        admins.renounceAdmin({ from: anyone }),
        'Admins: caller does not have an admin role'
      );
    });
  });
});
