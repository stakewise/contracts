const {
  BN,
  expectRevert,
  expectEvent,
  constants,
  ether,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { vrcAbi } = require('../../deployments/vrc');
const {
  checkCollectorBalance,
  checkSolo,
  checkValidatorRegistered,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');
const { validatorParams } = require('./validatorParams');

const Solos = artifacts.require('Solos');
const Validators = artifacts.require('Validators');

const validatorPrice = ether('10');
const validatorDeposit = ether('32');
const validator = validatorParams[0];

contract('Solos (register validator)', ([operator, sender, other]) => {
  const admin = contractSettings.solosAdmin;
  let vrc, solos, soloId;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, contractSettings.VRC);
  });

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender, admin, ether('5'));

    await upgradeContracts();

    solos = await Solos.at(contracts.solos);
    let validators = await Validators.at(contracts.validators);

    // assign operator
    await impersonateAccount(contractSettings.admin);
    await send.ether(sender, contractSettings.admin, ether('5'));
    await validators.addOperator(operator, { from: contractSettings.admin });
    await impersonateAccount(admin);

    await solos.setValidatorPrice(validatorPrice, {
      from: admin,
    });

    // create new solo
    await solos.addDeposit(validator.withdrawalCredentials, {
      from: sender,
      value: validatorDeposit,
    });
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      validator.withdrawalCredentials
    );
  });

  afterEach(async () => resetFork());

  it('fails to register validator for invalid solo ID', async () => {
    let validator = { soloId: constants.ZERO_BYTES32, ...validatorParams[0] };
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
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      solos.registerValidator(
        { soloId, ...validator },
        {
          from: other,
        }
      ),
      'Solos: access denied'
    );
    await checkSolo({
      solos,
      soloId,
      withdrawalCredentials: validator.withdrawalCredentials,
      amount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to register validator with used public key', async () => {
    await solos.addDeposit(validator.withdrawalCredentials, {
      from: sender,
      value: validatorDeposit,
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
      'Validators: invalid public key'
    );
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('fails to register validator twice', async () => {
    await solos.registerValidator(
      { soloId, ...validatorParams[0] },
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.registerValidator(
        { soloId, ...validatorParams[1] },
        {
          from: operator,
        }
      ),
      'Solos: insufficient balance'
    );

    await checkCollectorBalance(solos, new BN(0));
  });

  it('fails to register validator with paused solos', async () => {
    await solos.pause({ from: admin });
    expect(await solos.paused()).equal(true);

    await expectRevert(
      solos.registerValidator(
        { soloId, ...validatorParams[1] },
        {
          from: sender,
        }
      ),
      'Pausable: paused'
    );
    await checkCollectorBalance(solos, validatorDeposit);
  });

  it('not admin fails to update validator price', async () => {
    await expectRevert(
      solos.setValidatorPrice(validatorPrice, {
        from: other,
      }),
      'OwnablePausable: access denied'
    );
  });

  it('admin can update validator price', async () => {
    let receipt = await solos.setValidatorPrice(validatorPrice, {
      from: admin,
    });

    await expectEvent(receipt, 'ValidatorPriceUpdated', {
      validatorPrice: validatorPrice.toString(),
    });
  });

  it('registers single validator', async () => {
    // one validator is already created
    let totalAmount = validatorDeposit;
    let newValidators = [];
    newValidators.push({
      soloId: web3.utils.soliditySha3(
        solos.address,
        sender,
        validator.withdrawalCredentials
      ),
      ...validator,
    });

    for (let i = 1; i < validatorParams.length; i++) {
      await solos.addDeposit(validatorParams[i].withdrawalCredentials, {
        from: sender,
        value: validatorDeposit,
      });
      newValidators.push({
        soloId: web3.utils.soliditySha3(
          solos.address,
          sender,
          validatorParams[i].withdrawalCredentials
        ),
        ...validatorParams[i],
      });
      totalAmount = totalAmount.add(validatorDeposit);
    }

    // check balance increased correctly
    await checkCollectorBalance(solos, totalAmount);

    // register validators
    for (let i = 0; i < newValidators.length; i++) {
      let receipt = await solos.registerValidator(newValidators[i], {
        from: operator,
      });
      await checkValidatorRegistered({
        vrc,
        operator,
        transaction: receipt.tx,
        pubKey: newValidators[i].publicKey,
        withdrawalCredentials: newValidators[i].withdrawalCredentials,
        signature: validatorParams[i].signature,
      });
      await expectEvent(receipt, 'ValidatorRegistered', {
        publicKey: validatorParams[i].publicKey,
        soloId: newValidators[i].soloId,
        price: validatorPrice,
        operator,
      });
    }

    await checkCollectorBalance(solos);
  });
});
