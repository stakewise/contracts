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
const { validatorRegistrationArgs } = require('./validatorRegistrationArgs');

const Pool = artifacts.require('Pool');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];

contract('Pool (register validator)', ([_, ...accounts]) => {
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
      pool.registerValidator(pubKey, signature, hashTreeRoot, {
        from: other,
      }),
      'Pool: permission denied'
    );
    await checkCollectorBalance(pool, validatorDepositAmount);
    await checkPoolCollectedAmount(pool, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await pool.registerValidator(pubKey, signature, hashTreeRoot, {
      from: operator,
    });
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);

    // create new deposit
    await pool.addDeposit({
      from: sender1,
      value: validatorDepositAmount,
    });

    // Register validator 2 with the same validator public key
    await expectRevert(
      pool.registerValidator(pubKey, signature, hashTreeRoot, {
        from: operator,
      }),
      'Validators: public key has been already used'
    );
    await checkCollectorBalance(pool, validatorDepositAmount);
    await checkPoolCollectedAmount(pool, validatorDepositAmount);
  });

  it('fails to register validator when validator deposit amount is not collect', async () => {
    await pool.registerValidator(pubKey, signature, hashTreeRoot, {
      from: operator,
    });

    await expectRevert(
      pool.registerValidator(pubKey, signature, hashTreeRoot, {
        from: operator,
      }),
      'Pool: insufficient collected amount'
    );

    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('registers validators when validator deposit amount collected', async () => {
    // one validator is already created
    let totalAmount = validatorDepositAmount;

    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
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
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await pool.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        {
          from: operator,
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      await checkValidatorRegistered({
        vrc,
        transaction: tx,
        pubKey: validatorRegistrationArgs[i].pubKey,
        entityId: poolId,
        signature: validatorRegistrationArgs[i].signature,
      });
    }
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });
});
