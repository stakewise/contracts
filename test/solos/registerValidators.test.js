const { BN, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const { deployAndInitializeVRC, vrcAbi } = require('../../deployments/vrc');
const {
  checkCollectorBalance,
  checkSolo,
  checkValidatorRegistered,
} = require('../utils');
const { validators } = require('./validators');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Solos (register validators)', ([_, ...accounts]) => {
  let vrc, solos, soloId;
  let [admin, operator, sender, other] = accounts;

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
    await solos.addDeposit(validators[0].withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      validators[0].withdrawalCredentials
    );
  });

  it('fails to register validator for invalid solo ID', async () => {
    let validator = { soloId: constants.ZERO_BYTES32, ...validators[0] };
    await expectRevert(
      solos.registerValidators([validator], {
        from: operator,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials: validator.withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    let validator = { soloId, ...validators[0] };
    await expectRevert(
      solos.registerValidators([validator], {
        from: other,
      }),
      'Solos: permission denied'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials: validator.withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    await solos.addDeposit(validators[0].withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });

    let newValidators = [
      { soloId, ...validators[0] },
      { soloId, ...validators[0] },
    ];
    let newAmount = validatorDepositAmount.mul(new BN(2));

    // Register validators
    await expectRevert(
      solos.registerValidators(newValidators, {
        from: operator,
      }),
      'Validators: public key has been already used'
    );
    await checkCollectorBalance(solos, newAmount);
  });

  it('fails to register validator twice', async () => {
    let newValidators = [
      { soloId, ...validators[0] },
      { soloId, ...validators[1] },
    ];

    // Register validators
    await expectRevert(
      solos.registerValidators(newValidators, {
        from: operator,
      }),
      'Solos: insufficient balance'
    );

    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('registers multiple validators', async () => {
    // one validator is already created
    let totalAmount = validatorDepositAmount;
    let newValidators = [];
    newValidators.push({
      soloId: web3.utils.soliditySha3(
        solos.address,
        sender,
        validators[0].withdrawalCredentials
      ),
      ...validators[0],
    });

    for (let i = 1; i < validators.length; i++) {
      await solos.addDeposit(validators[i].withdrawalCredentials, {
        from: sender,
        value: validatorDepositAmount,
      });
      newValidators.push({
        soloId: web3.utils.soliditySha3(
          solos.address,
          sender,
          validators[i].withdrawalCredentials
        ),
        ...validators[i],
      });
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(solos, totalAmount);

    // register validators
    const { tx } = await solos.registerValidators(newValidators, {
      from: operator,
    });

    for (let i = 0; i < newValidators.length; i++) {
      await checkValidatorRegistered({
        vrc,
        transaction: tx,
        pubKey: newValidators[i].publicKey,
        entityId: newValidators[i].soloId,
        withdrawalCredentials: newValidators[i].withdrawalCredentials,
        signature: validators[i].signature,
      });
    }

    await checkCollectorBalance(solos);
  });
});
