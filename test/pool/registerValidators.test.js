const { BN, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const { deployAndInitializeVRC, vrcAbi } = require('../../deployments/vrc');
const {
  checkCollectorBalance,
  checkPoolCollectedAmount,
  checkValidatorRegistered,
  getDepositAmount,
} = require('../utils');
const { validators } = require('./validators');

const Pool = artifacts.require('Pool');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Pool (register validators)', ([_, ...accounts]) => {
  let vrc, pool, poolId;
  let [admin, operator, sender1, sender2, other] = accounts;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, await deployAndInitializeVRC());
  });

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      operators: operatorsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
      vrcContractAddress: vrc.options.address,
    });
    pool = await Pool.at(poolContractAddress);
    poolId = web3.utils.soliditySha3(pool.address);

    let operators = await Operators.at(operatorsContractAddress);
    await operators.addOperator(operator, { from: admin });

    // register pool
    let amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pool.addDeposit({
      from: sender1,
      value: amount1,
    });

    let amount2 = validatorDepositAmount.sub(amount1);
    await pool.addDeposit({
      from: sender2,
      value: amount2,
    });
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      pool.registerValidators(validators.slice(1), {
        from: other,
      }),
      'Pool: permission denied'
    );
    await checkCollectorBalance(pool, validatorDepositAmount);
    await checkPoolCollectedAmount(pool, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // create new deposit
    await pool.addDeposit({
      from: sender1,
      value: validatorDepositAmount,
    });

    // Register 2 validators with the same validator public key
    await expectRevert(
      pool.registerValidators([validators[0], validators[0]], {
        from: operator,
      }),
      'Validators: public key has been already used'
    );
    await checkCollectorBalance(pool, validatorDepositAmount.mul(new BN(2)));
    await checkPoolCollectedAmount(pool, validatorDepositAmount.mul(new BN(2)));
  });

  it('fails to register validator when validator deposit amount is not collect', async () => {
    await expectRevert(
      pool.registerValidators(validators.slice(2), {
        from: operator,
      }),
      'Pool: insufficient collected amount'
    );

    await checkCollectorBalance(pool, validatorDepositAmount);
    await checkPoolCollectedAmount(pool, validatorDepositAmount);
  });

  it('registers multiple validators at once', async () => {
    // one validator is already created
    let totalAmount = validatorDepositAmount;

    for (let i = 1; i < validators.length; i++) {
      await pool.addDeposit({
        from: sender1,
        value: validatorDepositAmount,
      });
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(pool, totalAmount);
    await checkPoolCollectedAmount(pool, totalAmount);

    // register validators
    const { tx } = await pool.registerValidators(validators, {
      from: operator,
    });

    for (let i = 0; i < validators.length; i++) {
      await checkValidatorRegistered({
        vrc,
        transaction: tx,
        pubKey: validators[i].publicKey,
        entityId: poolId,
        signature: validators[i].signature,
      });
    }

    // check balance empty
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });
});
