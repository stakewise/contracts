const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  expectEvent,
  time,
  constants,
  balance,
} = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const { deployAndInitializeVRC, vrcAbi } = require('../../deployments/vrc');
const { checkCollectorBalance, checkSolo } = require('../utils');
const { validators } = require('./validators');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');

const { withdrawalCredentials } = validators[0];
const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Solos (cancel deposit)', ([_, ...accounts]) => {
  let solos, soloId, vrc;
  let [admin, operator, sender, anyone] = accounts;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, await deployAndInitializeVRC());
  });

  beforeEach(async () => {
    let {
      solos: solosContractAddress,
      operators: operatorsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
      vrcContractAddress: vrc.options.address,
    });
    solos = await Solos.at(solosContractAddress);

    let operators = await Operators.at(operatorsContractAddress);
    await operators.addOperator(operator, { from: admin });

    // create new solo
    await solos.addDeposit(withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      withdrawalCredentials
    );
  });

  it('fails to cancel a deposit with invalid withdrawal credentials', async () => {
    await expectRevert(
      solos.cancelDeposit(constants.ZERO_BYTES32, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: anyone,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('can cancel a deposit with zero amount', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    const receipt = await solos.cancelDeposit(withdrawalCredentials, 0, {
      from: sender,
    });
    expectEvent(receipt, 'DepositCanceled', {
      soloId,
      amount: '0',
    });

    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit when lock duration has not passed', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: current time is before release time'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    await expectRevert(
      solos.cancelDeposit(
        withdrawalCredentials,
        validatorDepositAmount.add(ether('1')),
        {
          from: sender,
        }
      ),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with too small unit', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, ether('1'), {
        from: sender,
      }),
      'Solos: invalid cancel amount'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    await solos.registerValidators(
      [
        {
          publicKey: validators[0].publicKey,
          soloId,
          signature: validators[0].signature,
          depositDataRoot: validators[0].depositDataRoot,
        },
      ],
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({ solos, soloId, withdrawalCredentials });
    await checkCollectorBalance(solos);
  });

  it('fails to cancel deposit amount twice', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    await solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
      from: sender,
    });
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials: constants.ZERO_BYTES32,
    });
    await checkCollectorBalance(solos);
  });

  it('cancels deposit in full amount', async () => {
    await time.increase(initialSettings.withdrawalLockDuration);
    const prevBalance = await balance.current(sender);
    const receipt = await solos.cancelDeposit(
      withdrawalCredentials,
      validatorDepositAmount,
      {
        from: sender,
      }
    );
    expectEvent(receipt, 'DepositCanceled', {
      soloId,
      amount: validatorDepositAmount,
    });
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials: constants.ZERO_BYTES32,
    });
    await checkCollectorBalance(solos);

    // Check recipient balance changed
    expect(prevBalance.lt(await balance.current(sender))).to.be.equal(true);
  });
});
