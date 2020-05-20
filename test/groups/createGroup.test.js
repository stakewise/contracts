const { expect } = require('chai');
const { BN, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  getEntityId,
  checkPendingGroup,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');

contract('Groups (create group)', ([_, ...accounts]) => {
  let networkConfig, vrc, groups, settings;
  let [admin, manager, user1, user2, user3] = accounts;
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
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to create a group if paused', async () => {
    await settings.setContractPaused(groups.address, true, { from: admin });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.createGroup(groupMembers, { from: manager }),
      'New groups creation is currently disabled.'
    );
  });

  it('fails to create a group without members', async () => {
    await expectRevert(
      groups.createGroup([], { from: manager }),
      'The group members list cannot be empty.'
    );
  });

  it('any user can create a new staking group', async () => {
    const receipt = await groups.createGroup(groupMembers, {
      from: manager,
    });

    const groupId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      manager,
      groupId,
    });
    expect(receipt.logs[0].args.members).to.have.members(groupMembers);
    await checkPendingGroup({ groups, groupId, manager });
  });
});
