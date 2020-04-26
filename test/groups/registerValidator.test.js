const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  ether
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkValidatorRegistered,
  validatorRegistrationArgs,
  getEntityId
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN(86400);

contract('Groups (register validator)', ([_, ...accounts]) => {
  let networkConfig, vrc, validatorsRegistry, groups, groupId;
  let [admin, operator, groupCreator, sender, recipient, other] = accounts;
  let groupMembers = [sender];

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
      operators: operatorsProxy,
      validatorsRegistry: validatorsRegistryProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    groups = await Groups.at(groupsProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(groups.address, stakingDuration, {
      from: admin
    });

    // register group
    await groups.createGroup(groupMembers, {
      from: groupCreator
    });
    groupId = getEntityId(groups.address, new BN(1));
    await groups.addDeposit(groupId, recipient, {
      from: sender,
      value: validatorDepositAmount
    });
  });

  it('fails to register validator for invalid group', async () => {
    await expectRevert(
      groups.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        constants.ZERO_BYTES32,
        {
          from: operator
        }
      ),
      'Invalid validator deposit amount.'
    );
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
        from: other
      }),
      'Permission denied.'
    );
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
      from: operator
    });

    // create new group
    await groups.createGroup(groupMembers, {
      from: groupCreator
    });
    groupId = getEntityId(groups.address, new BN(2));
    await groups.addDeposit(groupId, recipient, {
      from: sender,
      value: validatorDepositAmount
    });

    // Register validator 2 with the same validator public key
    await expectRevert(
      groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
        from: operator
      }),
      'Public key has been already used.'
    );
  });

  it('fails to register validator for group which did not collect validator deposit amount', async () => {
    await groups.cancelDeposit(
      groupId,
      recipient,
      validatorDepositAmount.sub(ether('1')),
      {
        from: sender
      }
    );
    await expectRevert(
      groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
        from: operator
      }),
      'Invalid validator deposit amount.'
    );
  });

  it('fails to register validator for the same group twice', async () => {
    // Register validator first time
    await groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
      from: operator
    });

    // Register validator second time
    await expectRevert(
      groups.registerValidator(pubKey, signature, hashTreeRoot, groupId, {
        from: operator
      }),
      'Invalid validator deposit amount.'
    );
  });

  it('registers validators for groups with validator deposit amount collected', async () => {
    // one group is already created
    let totalAmount = validatorDepositAmount;

    // create registrable groups
    let groupIds = [groupId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      let receipt = await groups.createGroup(groupMembers, {
        from: groupCreator
      });
      groupId = receipt.logs[0].args.groupId;
      groupIds.push(groupId);

      await groups.addDeposit(groupId, recipient, {
        from: sender,
        value: validatorDepositAmount
      });
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(groups, totalAmount);

    // register validators
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await groups.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        groupIds[i],
        {
          from: operator
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      let pendingGroup = await groups.pendingGroups(groupIds[i]);
      expect(pendingGroup.maintainerFee).to.be.bignumber.equal(new BN(0));
      expect(pendingGroup.collectedAmount).to.be.bignumber.equal(new BN(0));

      await checkValidatorRegistered({
        vrc,
        stakingDuration,
        transaction: tx,
        entityId: groupIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: groups.address,
        validatorsRegistry: validatorsRegistry,
        signature: validatorRegistrationArgs[i].signature
      });
    }
    await checkCollectorBalance(groups, new BN(0));
  });
});
