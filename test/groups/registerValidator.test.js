const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  time,
  ether,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingGroup,
  checkValidatorRegistered,
  validatorRegistrationArgs,
  signValidatorTransfer,
  checkPayments,
  getEntityId,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const Managers = artifacts.require('Managers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const validatorPrice = new BN(initialSettings.validatorPrice);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';
const signature =
  '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b';
const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';
const depositDataRoot =
  '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f';
const stakingDuration = new BN(86400);

contract('Groups (register validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    dai,
    validators,
    validatorTransfers,
    groups,
    managers,
    groupId;
  let [admin, operator, manager, sender, recipient, other] = accounts;
  let groupMembers = [sender];

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
      managers: managersProxy,
      operators: operatorsProxy,
      validators: validatorsProxy,
      validatorTransfers: validatorTransfersProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    groups = await Groups.at(groupsProxy);
    validators = await Validators.at(validatorsProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransfersProxy);
    managers = await Managers.at(managersProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(groups.address, stakingDuration, {
      from: admin,
    });

    // register group
    await groups.createGroup(groupMembers, {
      from: manager,
    });
    groupId = getEntityId(groups.address, new BN(1));
    await groups.addDeposit(groupId, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
  });

  it('fails to register validator for invalid group', async () => {
    await expectRevert(
      groups.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      groups.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        groupId,
        {
          from: other,
        }
      ),
      'Permission denied.'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await groups.registerValidator(
      validatorRegistrationArgs[0].pubKey,
      validatorRegistrationArgs[0].signature,
      validatorRegistrationArgs[0].hashTreeRoot,
      groupId,
      {
        from: operator,
      }
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);

    // create new group
    await groups.createGroup(groupMembers, {
      from: manager,
    });
    groupId = getEntityId(groups.address, new BN(2));
    await groups.addDeposit(groupId, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });

    // Register validator 2 with the same validator public key
    await expectRevert(
      groups.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        groupId,
        {
          from: operator,
        }
      ),
      'Public key has been already used.'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator for group which did not collect validator deposit amount', async () => {
    let newBalance = validatorDepositAmount.sub(ether('1'));
    await groups.cancelDeposit(groupId, recipient, newBalance, {
      from: sender,
    });
    await expectRevert(
      groups.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        groupId,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: ether('1'),
    });
    await checkCollectorBalance(groups, ether('1'));
  });

  it('fails to register validator for the same group twice', async () => {
    // Register validator first time
    await groups.registerValidator(
      validatorRegistrationArgs[0].pubKey,
      validatorRegistrationArgs[0].signature,
      validatorRegistrationArgs[0].hashTreeRoot,
      groupId,
      {
        from: operator,
      }
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);

    // Register validator second time
    await expectRevert(
      groups.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        groupId,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);
  });

  it('registers validators for groups', async () => {
    // one group is already created
    let totalAmount = validatorDepositAmount;

    // create registrable groups
    let groupIds = [groupId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      let receipt = await groups.createGroup(groupMembers, {
        from: manager,
      });
      groupId = receipt.logs[0].args.groupId;
      groupIds.push(groupId);

      await groups.addDeposit(groupId, recipient, {
        from: sender,
        value: validatorDepositAmount,
      });
      await checkPendingGroup({
        groups,
        groupId,
        collectedAmount: validatorDepositAmount,
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
          from: operator,
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      await checkPendingGroup({ groups, groupId: groupIds[i] });
      await checkValidatorRegistered({
        vrc,
        stakingDuration,
        validators,
        transaction: tx,
        entityId: groupIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: groups.address,
        signature: validatorRegistrationArgs[i].signature,
      });

      // check manager permissions
      expect(
        await managers.canTransferValidator(
          groupIds[i],
          await signValidatorTransfer(manager, groupIds[i])
        )
      ).equal(true);

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(stakingDuration));
      expect(await validatorTransfers.checkTransferAllowed(groupIds[i])).equal(
        true
      );
    }
    await checkCollectorBalance(groups);
  });

  it('registers validators for private groups', async () => {
    // create private group
    let receipt = await groups.createPrivateGroup(
      groupMembers,
      withdrawalPublicKey,
      {
        from: manager,
      }
    );
    groupId = receipt.logs[0].args.groupId;
    let payments = receipt.logs[1].args.payments;

    await groups.addDeposit(groupId, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
    await checkPendingGroup({
      groups,
      groupId,
      payments,
      withdrawalCredentials,
      collectedAmount: validatorDepositAmount,
    });

    // check balance increased correctly
    // multiply by 2 as there is already one filled group in contract
    await checkCollectorBalance(groups, validatorDepositAmount.mul(new BN(2)));

    // register validator
    const { tx } = await groups.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      groupId,
      {
        from: operator,
      }
    );

    await checkValidatorRegistered({
      vrc,
      stakingDuration,
      validators,
      transaction: tx,
      entityId: groupId,
      pubKey: publicKey,
      collectorAddress: groups.address,
      signature,
      withdrawalCredentials,
      maintainerFee: new BN(0),
    });

    // check manager permissions
    expect(
      await managers.canTransferValidator(
        groupId,
        await signValidatorTransfer(manager, groupId)
      )
    ).equal(true);

    // check whether validator metering has started
    await checkPayments(payments, validatorPrice);

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));
    expect(await validatorTransfers.checkTransferAllowed(groupId)).equal(false);

    // there was one already filled group in contract
    await checkCollectorBalance(groups, validatorDepositAmount);
  });
});
