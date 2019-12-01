const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert
} = require('@openzeppelin/test-helpers');
const {
  deployAdminsProxy,
  deployWalletsManagersProxy
} = require('../../deployments/access');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { removeNetworkFile } = require('../utils');

const WalletsManagers = artifacts.require('WalletsManagers');

contract('WalletsManagers', ([_, admin, manager, anotherManager, anyone]) => {
  let networkConfig;
  let adminsProxy;
  let walletsManagers;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    adminsProxy = await deployAdminsProxy({
      networkConfig,
      initialAdmin: admin
    });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    walletsManagers = await WalletsManagers.at(
      await deployWalletsManagersProxy({ networkConfig, adminsProxy })
    );
  });

  describe('assigning', () => {
    it('admin can assign manager role to another account', async () => {
      const receipt = await walletsManagers.addManager(manager, {
        from: admin
      });
      expectEvent(receipt, 'ManagerAdded', {
        account: manager,
        issuer: admin
      });
      expect(await walletsManagers.isManager(manager)).equal(true);
      expect(await walletsManagers.isManager(admin)).equal(false);
      expect(await walletsManagers.isManager(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        walletsManagers.addManager(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned manager role multiple times', async () => {
      await walletsManagers.addManager(manager, { from: admin });
      expect(await walletsManagers.isManager(manager)).equal(true);
      await expectRevert(
        walletsManagers.addManager(manager, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('others cannot assign manager role to an account', async () => {
      await expectRevert(
        walletsManagers.addManager(manager, { from: anyone }),
        'Only admin users can assign managers.'
      );
      expect(await walletsManagers.isManager(manager)).equal(false);
      expect(await walletsManagers.isManager(anyone)).equal(false);
    });

    it('managers cannot assign manager role to others', async () => {
      await walletsManagers.addManager(manager, { from: admin });
      await expectRevert(
        walletsManagers.addManager(anotherManager, { from: manager }),
        'Only admin users can assign managers.'
      );
      expect(await walletsManagers.isManager(manager)).equal(true);
      expect(await walletsManagers.isManager(anotherManager)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await walletsManagers.addManager(manager, { from: admin });
      await walletsManagers.addManager(anotherManager, { from: admin });
    });

    it('anyone cannot remove managers', async () => {
      await expectRevert(
        walletsManagers.removeManager(manager, { from: anyone }),
        'Only admin users can remove managers.'
      );
      expect(await walletsManagers.isManager(manager)).equal(true);
      expect(await walletsManagers.isManager(anotherManager)).equal(true);
    });

    it('manager cannot remove other managers', async () => {
      await expectRevert(
        walletsManagers.removeManager(anotherManager, { from: manager }),
        'Only admin users can remove managers.'
      );
      expect(await walletsManagers.isManager(manager)).equal(true);
      expect(await walletsManagers.isManager(anotherManager)).equal(true);
    });

    it('cannot remove account without manager role', async () => {
      await expectRevert(
        walletsManagers.removeManager(anyone, { from: admin }),
        'Roles: account does not have role'
      );
      expect(await walletsManagers.isManager(manager)).equal(true);
      expect(await walletsManagers.isManager(anotherManager)).equal(true);
    });

    it('admins can remove managers', async () => {
      const receipt = await walletsManagers.removeManager(manager, {
        from: admin
      });
      expectEvent(receipt, 'ManagerRemoved', {
        account: manager,
        issuer: admin
      });
      expect(await walletsManagers.isManager(manager)).equal(false);
      expect(await walletsManagers.isManager(anotherManager)).equal(true);
    });
  });
});
