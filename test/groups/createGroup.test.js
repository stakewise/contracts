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
  signValidatorTransfer,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');
const Managers = artifacts.require('Managers');

contract('Groups (create group)', ([_, ...accounts]) => {
  let networkConfig, vrc, groups, managers, settings;
  let [admin, creator, user1, user2, user3] = accounts;
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
      managers: managersProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);
    managers = await Managers.at(managersProxy);
  });

  it('fails to create a group if paused', async () => {
    await settings.setContractPaused(groups.address, true, { from: admin });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.createGroup(groupMembers, { from: creator }),
      'Groups creation is currently disabled.'
    );
  });

  it('fails to create a group without members', async () => {
    await expectRevert(
      groups.createGroup([], { from: creator }),
      'The group members list cannot be empty.'
    );
  });

  it('can create a new group', async () => {
    const receipt = await groups.createGroup(groupMembers, {
      from: creator,
    });

    const groupId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      creator,
      canTransfer: true,
      groupId,
    });
    expect(receipt.logs[0].args.members).to.have.members(groupMembers);
    expect(
      await managers.canTransferValidator(
        groupId,
        await signValidatorTransfer(creator, groupId)
      )
    ).equal(true);
    await checkPendingGroup({ groups, groupId });
  });
});
