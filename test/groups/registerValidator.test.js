const {
  BN,
  expectRevert,
  constants,
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
  checkPayments,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');

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

contract('Groups (register validator)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, groups, payments, groupId;
  let [admin, operator, groupCreator, sender, other] = accounts;
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
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    groups = await Groups.at(groupsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // register group
    let receipt = await groups.createGroup(groupMembers, withdrawalPublicKey, {
      from: groupCreator,
    });
    groupId = web3.utils.soliditySha3(groups.address, new BN(1));
    payments = receipt.logs[0].args.payments;
    await groups.addDeposit(groupId, {
      from: sender,
      value: validatorDepositAmount,
    });
  });

  it('fails to register validator for invalid group', async () => {
    await expectRevert(
      groups.registerValidator(
        publicKey,
        signature,
        depositDataRoot,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Groups: invalid group ID'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      groups.registerValidator(publicKey, signature, depositDataRoot, groupId, {
        from: other,
      }),
      'Groups: permission denied'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await groups.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      groupId,
      {
        from: operator,
      }
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);

    // create new group
    let receipt = await groups.createGroup(groupMembers, withdrawalPublicKey, {
      from: groupCreator,
    });
    groupId = web3.utils.soliditySha3(groups.address, new BN(2));
    payments = receipt.logs[0].args.payments;
    await groups.addDeposit(groupId, {
      from: sender,
      value: validatorDepositAmount,
    });

    // Register validator 2 with the same validator public key
    await expectRevert(
      groups.registerValidator(publicKey, signature, depositDataRoot, groupId, {
        from: operator,
      }),
      'Validators: public key has been already used'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: validatorDepositAmount,
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to register validator for group which did not collect validator deposit amount', async () => {
    let newBalance = validatorDepositAmount.sub(ether('1'));
    await groups.cancelDeposit(groupId, newBalance, {
      from: sender,
    });
    await expectRevert(
      groups.registerValidator(publicKey, signature, depositDataRoot, groupId, {
        from: operator,
      }),
      'Groups: invalid group ID'
    );
    await checkPendingGroup({
      groups,
      groupId,
      collectedAmount: ether('1'),
      withdrawalCredentials,
      payments,
    });
    await checkCollectorBalance(groups, ether('1'));
  });

  it('fails to register validator for the same group twice', async () => {
    // Register validator first time
    await groups.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      groupId,
      {
        from: operator,
      }
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);

    // Register validator second time
    await expectRevert(
      groups.registerValidator(publicKey, signature, depositDataRoot, groupId, {
        from: operator,
      }),
      'Groups: invalid group ID'
    );
    await checkPendingGroup({ groups, groupId });
    await checkCollectorBalance(groups);
  });

  it('registers validator', async () => {
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
      transaction: tx,
      pubKey: publicKey,
      entityId: groupId,
      signature,
      withdrawalCredentials,
    });

    // check whether validator metering has started
    await checkPayments(payments, validatorPrice);

    await checkCollectorBalance(groups);
  });
});
