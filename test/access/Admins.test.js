const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert
} = require('openzeppelin-test-helpers');
const { deployAdminsProxy } = require('../../deployments/access');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { removeNetworkFile } = require('../utils');

const Admins = artifacts.require('Admins');

contract('Admins', ([_, admin, otherAdmin, anyone]) => {
  let networkConfig;
  let admins;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    admins = await Admins.at(
      await deployAdminsProxy({ networkConfig, initialAdmin: admin })
    );
  });

  it('assigns admin on initialization', async () => {
    let admins = await Admins.new();
    const { logs } = await admins.initialize(admin);
    expect(await admins.isAdmin(admin)).equal(true);
    expectEvent.inLogs(logs, 'AdminAdded', {
      account: admin
    });
  });

  describe('assigning', () => {
    it('admins can assign admin role to another account', async () => {
      const { logs } = await admins.addAdmin(otherAdmin, { from: admin });
      expectEvent.inLogs(logs, 'AdminAdded', {
        account: otherAdmin
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
        'Caller does not have an Admin role.'
      );
      expect(await admins.isAdmin(otherAdmin)).equal(false);
      expect(await admins.isAdmin(anyone)).equal(false);
    });
  });

  describe('renouncing', () => {
    it('admin can renounce himself', async () => {
      const { logs } = await admins.renounceAdmin({ from: admin });
      expectEvent.inLogs(logs, 'AdminRemoved', {
        account: admin
      });
      expect(await admins.isAdmin(admin)).equal(false);
    });

    it('others cannot renounce themselves', async () => {
      await expectRevert(
        admins.renounceAdmin({ from: anyone }),
        'Caller does not have an Admin role.'
      );
    });
  });
});
