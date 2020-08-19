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
  signValidatorTransfer,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Settings = artifacts.require('Settings');
const Managers = artifacts.require('Managers');

const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Groups (create private group)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, groups, managers, settings;
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
      managers: managersProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    groups = await Groups.at(groupsProxy);
    settings = await Settings.at(settingsProxy);
    managers = await Managers.at(managersProxy);
  });

  it('fails to create a group if paused', async () => {
    await settings.setContractPaused(groups.address, true, { from: admin });
    expect(await settings.pausedContracts(groups.address)).equal(true);

    await expectRevert(
      groups.createPrivateGroup(groupMembers, withdrawalPublicKey, {
        from: creator,
      }),
      'Private groups creation is currently disabled.'
    );
  });

  it('fails to create a group without members', async () => {
    await expectRevert(
      groups.createPrivateGroup([], withdrawalPublicKey, { from: creator }),
      'The group members list cannot be empty.'
    );
  });

  it('fails to create a group with invalid withdrawal key', async () => {
    await expectRevert(
      groups.createPrivateGroup([], constants.ZERO_BYTES32, { from: creator }),
      'Invalid BLS withdrawal public key.'
    );
  });

  it('can create a new private group', async () => {
    const receipt = await groups.createPrivateGroup(
      groupMembers,
      withdrawalPublicKey,
      {
        from: creator,
      }
    );

    const groupId = getEntityId(groups.address, new BN(1));
    expectEvent(receipt, 'GroupCreated', {
      creator,
      canTransfer: false,
      groupId,
    });

    let payments = receipt.logs[1].args.payments;
    expectEvent(receipt, 'PrivateEntityAdded', {
      entityId: groupId,
      payments,
      withdrawalPublicKey,
      withdrawalCredentials,
    });

    expect(receipt.logs[0].args.members).to.have.members(groupMembers);
    expect(
      await managers.canTransferValidator(
        groupId,
        await signValidatorTransfer(creator, groupId)
      )
    ).equal(true);
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
    });
  });
});
