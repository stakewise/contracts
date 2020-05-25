const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  constants,
  balance,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkUserTotalAmount,
  checkCollectorBalance,
  checkValidatorDepositData,
  checkDepositCanceled,
  getEntityId,
  signMessage,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const PrivateIndividuals = artifacts.require('PrivateIndividuals');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const depositData = {
  amount: validatorDepositAmount,
  withdrawalCredentials:
    '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061',
  signature:
    '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b',
  publicKey:
    '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7',
  depositDataRoot:
    '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f',
};

contract('Private Individuals (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, individuals, individualId;
  let [admin, operator, sender1, recipient1] = accounts;

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
      deposits: depositsProxy,
      privateIndividuals: individualsProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    individuals = await PrivateIndividuals.at(individualsProxy);
    deposits = await Deposits.at(depositsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new private individual
    await individuals.addDeposit(withdrawalPublicKey, recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });
    individualId = getEntityId(individuals.address, new BN(1));
  });

  it('fails to cancel a deposit with invalid recipient address', async () => {
    await expectRevert(
      individuals.cancelDeposit(individualId, constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'The user does not have a deposit.'
    );

    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials: depositData.withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: recipient1,
      }),
      'The user does not have a deposit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkValidatorDepositData(individuals, individualId, {
      withdrawalCredentials: depositData.withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    // create operator signature
    let messageHash = web3.utils.soliditySha3(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId
    );
    let operatorSignature = await signMessage(operator, messageHash);

    // approve deposit data
    await individuals.approveDepositData(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId,
      operatorSignature,
      recipient1,
      {
        from: sender1,
      }
    );
    await individuals.registerValidator(individualId, {
      from: operator,
    });

    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: sender1,
      }),
      'Cannot cancel deposit which has started staking.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkValidatorDepositData(individuals, individualId, {
      ...depositData,
      submitted: true,
    });
    await checkCollectorBalance(individuals);
  });

  it('fails to cancel deposit amount twice', async () => {
    await individuals.cancelDeposit(individualId, recipient1, {
      from: sender1,
    });
    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: sender1,
      }),
      'The user does not have a deposit.'
    );
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });

  it('cancels deposit in full amount', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    const { tx } = await individuals.cancelDeposit(individualId, recipient1, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: validatorDepositAmount,
      totalAmount: ether('0'),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(
      validatorDepositAmount
    );
    // Check balance
    await checkValidatorDepositData(individuals, individualId);
    await checkCollectorBalance(individuals);
  });
});
