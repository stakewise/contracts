const { expect } = require('chai');
const {
  ether,
  expectRevert,
  expectEvent,
  time,
  constants,
  balance,
} = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { deployAndInitializeVRC, vrcAbi } = require('../../deployments/vrc');
const { checkCollectorBalance, checkSolo } = require('../utils');
const { validatorParams } = require('./validatorParams');

const Solos = artifacts.require('Solos');
const Validators = artifacts.require('Validators');

const validatorDeposit = ether('32');
const cancelLockDuration = 86400; // 1 day
const { withdrawalCredentials } = validatorParams[0];

contract('Solos (cancel deposit)', ([_, ...accounts]) => {
  let solos, soloId, vrc;
  let [admin, operator, sender, anyone] = accounts;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, await deployAndInitializeVRC());
  });

  beforeEach(async () => {
    let {
      solos: solosContractAddress,
      validators: validatorsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
      vrcContractAddress: vrc.options.address,
    });
    solos = await Solos.at(solosContractAddress);

    let validators = await Validators.at(validatorsContractAddress);
    await validators.addOperator(operator, { from: admin });
    await solos.setCancelLockDuration(cancelLockDuration, {
      from: admin,
    });

    // create new solo
    await solos.addDeposit(withdrawalCredentials, {
      from: sender,
      value: validatorDeposit,
    });
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      withdrawalCredentials
    );
  });

  it('fails to cancel a deposit with invalid withdrawal credentials', async () => {
    await expectRevert(
      solos.cancelDeposit(constants.ZERO_BYTES32, validatorDeposit, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDeposit, {
        from: anyone,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('can cancel a deposit with zero amount', async () => {
    await time.increase(cancelLockDuration);
    const receipt = await solos.cancelDeposit(withdrawalCredentials, 0, {
      from: sender,
    });
    expectEvent(receipt, 'DepositCanceled', {
      soloId,
      amount: '0',
      sender,
      withdrawalCredentials,
    });

    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to cancel a deposit when lock duration has not passed', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDeposit, {
        from: sender,
      }),
      'Solos: too early cancel'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('not admin fails to update cancel lock duration', async () => {
    await expectRevert(
      solos.setCancelLockDuration(cancelLockDuration, {
        from: anyone,
      }),
      'OwnablePausable: access denied'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('admin can update cancel lock duration', async () => {
    let receipt = await solos.setCancelLockDuration(cancelLockDuration, {
      from: admin,
    });

    await expectEvent(receipt, 'CancelLockDurationUpdated', {
      cancelLockDuration: cancelLockDuration.toString(),
    });
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await time.increase(cancelLockDuration);
    await expectRevert(
      solos.cancelDeposit(
        withdrawalCredentials,
        validatorDeposit.add(ether('1')),
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
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to cancel a deposit with too small unit', async () => {
    await time.increase(cancelLockDuration);
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
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    await time.increase(cancelLockDuration);
    await solos.registerValidator(
      {
        publicKey: validatorParams[0].publicKey,
        soloId,
        signature: validatorParams[0].signature,
        depositDataRoot: validatorParams[0].depositDataRoot,
      },
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDeposit, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({ solos, soloId, withdrawalCredentials });
    await checkCollectorBalance(solos);
  });

  it('fails to cancel deposit amount twice', async () => {
    await time.increase(cancelLockDuration);
    await solos.cancelDeposit(withdrawalCredentials, validatorDeposit, {
      from: sender,
    });
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDeposit, {
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
    await time.increase(cancelLockDuration);
    const prevBalance = await balance.current(sender);
    const receipt = await solos.cancelDeposit(
      withdrawalCredentials,
      validatorDeposit,
      {
        from: sender,
      }
    );
    expectEvent(receipt, 'DepositCanceled', {
      soloId,
      amount: validatorDeposit,
      sender,
      withdrawalCredentials,
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
