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
const validator = validators[0];

contract('Solos (register validator)', ([_, ...accounts]) => {
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
    await solos.addDeposit(validator.withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      validator.withdrawalCredentials
    );
  });

  it('fails to register validator for invalid solo ID', async () => {
    let validator = { soloId: constants.ZERO_BYTES32, ...validators[0] };
    await expectRevert(
      solos.registerValidator(validator, {
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
    await expectRevert(
      solos.registerValidator(
        { soloId, ...validator },
        {
          from: other,
        }
      ),
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
    await solos.addDeposit(validator.withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });

    await solos.registerValidator(
      { soloId, ...validator },
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.registerValidator(
        { soloId, ...validator },
        {
          from: operator,
        }
      ),
      'Validators: public key has been already used'
    );
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator twice', async () => {
    await solos.registerValidator(
      { soloId, ...validators[0] },
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.registerValidator(
        { soloId, ...validators[1] },
        {
          from: operator,
        }
      ),
      'Solos: insufficient balance'
    );

    await checkCollectorBalance(solos, new BN(0));
  });

  it('registers single validator', async () => {
    // one validator is already created
    let totalAmount = validatorDepositAmount;
    let newValidators = [];
    newValidators.push({
      soloId: web3.utils.soliditySha3(
        solos.address,
        sender,
        validator.withdrawalCredentials
      ),
      ...validator,
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
    for (let i = 0; i < newValidators.length; i++) {
      const { tx } = await solos.registerValidator(newValidators[i], {
        from: operator,
      });
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
