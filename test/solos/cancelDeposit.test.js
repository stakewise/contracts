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
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkUserTotalAmount,
  checkCollectorBalance,
  checkPendingSolo,
  checkDepositCanceled,
  getEntityId,
  validatorRegistrationArgs,
} = require('../common/utils');

const Deposits = artifacts.require('Deposits');
const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');

const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Solos (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig, deposits, vrc, dai, solos, soloId;
  let [admin, operator, sender1, recipient1] = accounts;

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
      deposits: depositsProxy,
      solos: solosProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    solos = await Solos.at(solosProxy);
    deposits = await Deposits.at(depositsProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new solo
    await solos.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });
    soloId = getEntityId(solos.address, new BN(1));
  });

  it('fails to cancel a deposit with invalid recipient address', async () => {
    await expectRevert(
      solos.cancelDeposit(soloId, constants.ZERO_ADDRESS, {
        from: sender1,
      }),
      'The user does not have a deposit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: soloId,
      collectorAddress: solos.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      solos.cancelDeposit(soloId, recipient1, {
        from: recipient1,
      }),
      'The user does not have a deposit.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: soloId,
      collectorAddress: solos.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    await solos.registerValidator(pubKey, signature, hashTreeRoot, soloId, {
      from: operator,
    });

    await expectRevert(
      solos.cancelDeposit(soloId, recipient1, {
        from: sender1,
      }),
      'Cannot cancel deposit which has started staking.'
    );
    await checkUserTotalAmount({
      depositsContract: deposits,
      expectedAmount: validatorDepositAmount,
      entityId: soloId,
      collectorAddress: solos.address,
      senderAddress: sender1,
      recipientAddress: recipient1,
    });
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('fails to cancel deposit amount twice', async () => {
    await solos.cancelDeposit(soloId, recipient1, {
      from: sender1,
    });
    await expectRevert(
      solos.cancelDeposit(soloId, recipient1, {
        from: sender1,
      }),
      'The user does not have a deposit.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('cancels deposit in full amount', async () => {
    const recipientBalance = await balance.tracker(recipient1);
    const { tx } = await solos.cancelDeposit(soloId, recipient1, {
      from: sender1,
    });
    await checkDepositCanceled({
      transaction: tx,
      depositsContract: deposits,
      collectorAddress: solos.address,
      entityId: soloId,
      senderAddress: sender1,
      recipientAddress: recipient1,
      canceledAmount: validatorDepositAmount,
      totalAmount: ether('0'),
    });

    // Check recipient balance changed
    expect(await recipientBalance.delta()).to.be.bignumber.equal(
      validatorDepositAmount
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });
});
