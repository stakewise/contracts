const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeManagers,
} = require('../../deployments/access');

const Managers = artifacts.require('Managers');

contract('Managers', ([_, ...accounts]) => {
  let admins, managers;
  let [admin, manager, anotherManager, anyone] = accounts;

  before(async () => {
    admins = await deployAndInitializeAdmins(admin);
  });

  beforeEach(async () => {
    managers = await Managers.at(await deployAndInitializeManagers(admins));
  });

  describe('assigning', () => {
    it('admin can assign manager role to another account', async () => {
      const receipt = await managers.addManager(manager, {
        from: admin,
      });
      expectEvent(receipt, 'ManagerAdded', {
        account: manager,
      });
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(admin)).equal(false);
      expect(await managers.isManager(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        managers.addManager(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned manager role multiple times', async () => {
      await managers.addManager(manager, { from: admin });
      expect(await managers.isManager(manager)).equal(true);
      await expectRevert(
        managers.addManager(manager, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('others cannot assign manager role to an account', async () => {
      await expectRevert(
        managers.addManager(manager, { from: anyone }),
        'Managers: only admin users can assign managers'
      );
      expect(await managers.isManager(manager)).equal(false);
      expect(await managers.isManager(anyone)).equal(false);
    });

    it('managers cannot assign manager role to others', async () => {
      await managers.addManager(manager, { from: admin });
      await expectRevert(
        managers.addManager(anotherManager, { from: manager }),
        'Managers: only admin users can assign managers'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await managers.addManager(manager, { from: admin });
      await managers.addManager(anotherManager, { from: admin });
    });

    it('anyone cannot remove managers', async () => {
      await expectRevert(
        managers.removeManager(manager, { from: anyone }),
        'Managers: only admin users can remove managers'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(true);
    });

    it('manager cannot remove other managers', async () => {
      await expectRevert(
        managers.removeManager(anotherManager, { from: manager }),
        'Managers: only admin users can remove managers'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(true);
    });

    it('cannot remove account without manager role', async () => {
      await expectRevert(
        managers.removeManager(anyone, { from: admin }),
        'Roles: account does not have role'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(true);
    });

    it('admins can remove managers', async () => {
      const receipt = await managers.removeManager(manager, {
        from: admin,
      });
      expectEvent(receipt, 'ManagerRemoved', {
        account: manager,
      });
      expect(await managers.isManager(manager)).equal(false);
      expect(await managers.isManager(anotherManager)).equal(true);
    });
  });
});
