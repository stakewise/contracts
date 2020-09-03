const { expect } = require('chai');
const {
  BN,
  expectRevert,
  expectEvent,
  constants,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  getEntityId,
  checkPendingGroup,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');

const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Groups (create group)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, groups, settings;
  let [admin, creator, user1, user2, user3] = accounts;
  let groupMembers = [user1, user2, user3];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
    dai = await deployDAI(admin, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let {
      groups: groupsProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to create a group if paused', async () => {
    await settings.setContractPaused(groups.address, true, { from: admin });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.createGroup(groupMembers, withdrawalPublicKey, {
        from: creator,
      }),
      'Groups: contract is paused'
    );
  });

  it('fails to create a group without members', async () => {
    await expectRevert(
      groups.createGroup([], withdrawalPublicKey, { from: creator }),
      'Groups: members list cannot be empty'
    );
  });

  it('fails to create a group with invalid withdrawal key', async () => {
    await expectRevert(
      groups.createGroup([], constants.ZERO_BYTES32, { from: creator }),
      'Groups: invalid BLS withdrawal public key'
    );
  });

  it('can create a new group', async () => {
    const receipt = await groups.createGroup(
      groupMembers,
      withdrawalPublicKey,
      {
        from: creator,
      }
    );

    const payments = receipt.logs[0].args.payments;
    const groupId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      groupId,
      creator,
      payments,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    expect(receipt.logs[0].args.members).to.have.members(groupMembers);
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
  });
});
