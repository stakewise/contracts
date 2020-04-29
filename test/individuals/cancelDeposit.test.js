const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  constants,
  balance
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
  checkUserTotalAmount,
  checkCollectorBalance,
  checkPendingIndividual,
  checkDepositCanceled,
  getEntityId,
  validatorRegistrationArgs
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Individuals = artifacts.require('Individuals');
const Operators = artifacts.require('Operators');

const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Individuals (cancel deposit)', ([_, ...accounts]) => {
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
      individuals: individualsProxy,
      operators: operatorsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    individuals = await Individuals.at(individualsProxy);
    deposits = await Deposits.at(depositsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new individual
    await individuals.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount
    });
    individualId = getEntityId(individuals.address, new BN(1));
  });

  it('fails to cancel a deposit with invalid recipient address', async () => {
    await expectRevert(
      individuals.cancelDeposit(individualId, constants.ZERO_ADDRESS, {
        from: sender1
      }),
      'The user does not have a deposit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1
    });
    await checkPendingIndividual(individuals, individualId, true);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: recipient1
      }),
      'The user does not have a deposit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1
    });
    await checkPendingIndividual(individuals, individualId, true);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    await individuals.registerValidator(
      pubKey,
      signature,
      hashTreeRoot,
      individualId,
      {
        from: operator
      }
    );

    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: sender1
      }),
      'Cannot cancel deposit which has started staking.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: individualId,
      collectorAddress: individuals.address,
      senderAddress: sender1,
      recipientAddress: recipient1
    });
    await checkPendingIndividual(individuals, individualId, false);
    await checkCollectorBalance(individuals, new BN(0));
  });

  it('fails to cancel deposit amount twice', async () => {
    await individuals.cancelDeposit(individualId, recipient1, {
      from: sender1
    });
    await expectRevert(
      individuals.cancelDeposit(individualId, recipient1, {
        from: sender1
      }),
      'The user does not have a deposit.'
    );
    await checkPendingIndividual(individuals, individualId, false);
    await checkCollectorBalance(individuals, new BN(0));
  });

  it('cancels deposit in full amount', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    const { tx } = await individuals.cancelDeposit(individualId, recipient1, {
      from: sender1
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: individuals.address,
      entityId: individualId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: validatorDepositAmount,
      totalAmount: ether('0')
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(
      validatorDepositAmount
    );
    // Check balance
    await checkPendingIndividual(individuals, individualId, false);
    await checkCollectorBalance(individuals, new BN(0));
  });
});
