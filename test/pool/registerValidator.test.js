const {
  BN,
  expectRevert,
  expectEvent,
  ether,
  balance,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { vrcAbi } = require('../../deployments/vrc');
const {
  checkCollectorBalance,
  checkPoolTotalActivatingAmount,
  checkValidatorRegistered,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');
const { validatorParams } = require('./validatorParams');

const Pool = artifacts.require('Pool');
const Validators = artifacts.require('Validators');

const validatorDeposit = ether('32');
const withdrawalCredentials =
  '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';
const validator = validatorParams[0];

contract('Pool (register validator)', ([operator, sender, other]) => {
  const admin = contractSettings.admin;
  let pool, vrc;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, contractSettings.VRC);
  });

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    let validators = await Validators.at(contracts.validators);
    await validators.addOperator(operator, { from: admin });

    // collect validator deposit
    let poolBalance = await balance.current(pool.address);
    let depositAmount = validatorDeposit.sub(poolBalance);
    await pool.addDeposit({
      from: sender,
      value: depositAmount,
    });
  });

  afterEach(async () => resetFork());

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      pool.registerValidator(validator, {
        from: other,
      }),
      'Pool: access denied'
    );
  });

  it('fails to register validator with paused pool', async () => {
    await pool.pause({ from: admin });
    expect(await pool.paused()).equal(true);

    await expectRevert(
      pool.registerValidator(validator, {
        from: other,
      }),
      'Pausable: paused'
    );
  });

  it('fails to register validator with used public key', async () => {
    await pool.setWithdrawalCredentials(withdrawalCredentials, {
      from: admin,
    });

    // create new deposit
    await pool.addDeposit({
      from: sender,
      value: validatorDeposit,
    });

    // Register 1 validator
    await pool.registerValidator(validator, {
      from: operator,
    });

    // Register 2 validator with the same validator public key
    await expectRevert(
      pool.registerValidator(validator, {
        from: operator,
      }),
      'Validators: invalid public key'
    );
    await checkCollectorBalance(pool, validatorDeposit);
    await checkPoolTotalActivatingAmount(
      pool,
      new BN(contractSettings.beaconActivatingAmount).add(
        validatorDeposit.mul(new BN(2))
      )
    );
  });

  it('fails to register validator when validator deposit amount is not collect', async () => {
    await pool.setWithdrawalCredentials(withdrawalCredentials, {
      from: admin,
    });

    // Register 1 validator
    await pool.registerValidator(validator, {
      from: operator,
    });

    await expectRevert.unspecified(
      pool.registerValidator(validatorParams[1], {
        from: operator,
      })
    );

    await checkCollectorBalance(pool, new BN(0));
    await checkPoolTotalActivatingAmount(
      pool,
      new BN(contractSettings.beaconActivatingAmount).add(validatorDeposit)
    );
  });

  it('registers validator', async () => {
    await pool.setWithdrawalCredentials(withdrawalCredentials, {
      from: admin,
    });

    // one validator is already created
    let totalAmount = validatorDeposit;

    for (let i = 1; i < validatorParams.length; i++) {
      await pool.addDeposit({
        from: sender,
        value: validatorDeposit,
      });
      totalAmount = totalAmount.add(validatorDeposit);
    }

    let totalActivatingAmount = new BN(
      contractSettings.beaconActivatingAmount
    ).add(totalAmount);

    // check balance increased correctly
    await checkCollectorBalance(pool, totalAmount);
    await checkPoolTotalActivatingAmount(pool, totalActivatingAmount);

    // register validators
    for (let i = 0; i < validatorParams.length; i++) {
      const receipt = await pool.registerValidator(validatorParams[i], {
        from: operator,
      });
      await expectEvent(receipt, 'ValidatorRegistered', {
        publicKey: validatorParams[i].publicKey,
        operator,
      });
      totalAmount = totalAmount.sub(validatorDeposit);
      await checkValidatorRegistered({
        vrc,
        operator,
        transaction: receipt.tx,
        pubKey: validatorParams[i].publicKey,
        withdrawalCredentials,
        signature: validatorParams[i].signature,
      });
    }

    // check balance empty
    await checkCollectorBalance(pool);
    await checkPoolTotalActivatingAmount(pool, totalActivatingAmount);
  });
});
