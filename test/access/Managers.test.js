const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile } = require('../common/utils');

const Managers = artifacts.require('Managers');
const entityId =
  '0xd5399111f6a7d6b0ea29fe682b6046191f613b4bff0c4f7ebb28dd62e6fd5434';

contract('Managers', ([_, ...accounts]) => {
  let networkConfig, vrc, managers;
  let [admin, manager, anotherManager, anyone] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let { managers: managersProxy } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    managers = await Managers.at(managersProxy);
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
        'Only admin users can assign managers.'
      );
      expect(await managers.isManager(manager)).equal(false);
      expect(await managers.isManager(anyone)).equal(false);
    });

    it('managers cannot assign manager role to others', async () => {
      await managers.addManager(manager, { from: admin });
      await expectRevert(
        managers.addManager(anotherManager, { from: manager }),
        'Only admin users can assign managers.'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(false);
    });

    it('only collectors can assign transfer managers', async () => {
      for (const user of [manager, admin, anyone]) {
        await expectRevert(
          managers.addTransferManager(entityId, anyone, {
            from: user,
          }),
          'Permission denied.'
        );
      }
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
        'Only admin users can remove managers.'
      );
      expect(await managers.isManager(manager)).equal(true);
      expect(await managers.isManager(anotherManager)).equal(true);
    });

    it('manager cannot remove other managers', async () => {
      await expectRevert(
        managers.removeManager(anotherManager, { from: manager }),
        'Only admin users can remove managers.'
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
