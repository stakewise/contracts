const { BN, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, getEntityId } = require('../common/utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');

contract('Groups (create group)', ([_, ...accounts]) => {
  let networkConfig, vrc, groups, settings;
  let [admin, groupCreator, user1, user2, user3] = accounts;
  let groupMembers = [user1, user2, user3];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let {
      groups: groupsProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to create a group if paused', async () => {
    await settings.setContractPaused(groups.address, true, { from: admin });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.createGroup(groupMembers, { from: groupCreator }),
      'New groups creation is currently disabled.'
    );
  });

  it('fails to create a group without members', async () => {
    await expectRevert(
      groups.createGroup([], { from: groupCreator }),
      'The group members list cannot be empty.'
    );
  });

  it('any user can create a new staking group', async () => {
    const receipt = await groups.createGroup(groupMembers, {
      from: groupCreator
    });

    const entityId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      creator: groupCreator,
      groupId: entityId
    });

    for (let i = 0; i < groupMembers.length; i++) {
      let userId = web3.utils.soliditySha3(entityId, groupMembers[i]);
      expect(await groups.registeredMembers(userId)).equal(true);
    }
    let creatorId = web3.utils.soliditySha3(entityId, groupCreator);
    expect(await groups.registeredMembers(creatorId)).equal(true);
  });

  it('increases entities count for every new group', async () => {
    let receipt = await groups.createGroup(groupMembers, {
      from: groupCreator
    });

    let entityId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      creator: groupCreator,
      groupId: entityId
    });

    receipt = await groups.createGroup(groupMembers, {
      from: groupCreator
    });

    entityId = getEntityId(groups.address, new BN(2));
    expectEvent(receipt, 'GroupCreated', {
      creator: groupCreator,
      groupId: entityId
    });
  });
});
