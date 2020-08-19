const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  time,
  ether,
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
  checkCollectorBalance,
  checkPendingPool,
  checkValidatorRegistered,
  getDepositAmount,
  validatorRegistrationArgs,
  checkNewPoolCollectedAmount,
  getEntityId,
} = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN(86400);

contract('Pools (register validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    dai,
    pools,
    validators,
    validatorTransfers,
    settings,
    poolId;
  let [
    admin,
    operator,
    sender1,
    recipient1,
    sender2,
    recipient2,
    other,
  ] = accounts;

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
      pools: poolsProxy,
      operators: operatorsProxy,
      validators: validatorsProxy,
      validatorTransfers: validatorTransfersProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    pools = await Pools.at(poolsProxy);
    validators = await Validators.at(validatorsProxy);
    settings = await Settings.at(settingsProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransfersProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // register pool
    let amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: amount1,
    });

    let amount2 = validatorDepositAmount.sub(amount1);
    await pools.addDeposit(recipient2, {
      from: sender2,
      value: amount2,
    });
    poolId = getEntityId(pools.address, new BN(1));
  });

  it('fails to register validator for invalid pool', async () => {
    await expectRevert(
      pools.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Invalid pool ID.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: other,
      }),
      'Permission denied.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
      from: operator,
    });
    await checkPendingPool(pools, poolId, false);
    await checkCollectorBalance(pools);

    // create new pool
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount,
    });
    poolId = getEntityId(pools.address, new BN(2));

    // Register validator 2 with the same validator public key
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator,
      }),
      'Public key has been already used.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator for pool which did not collect validator deposit amount', async () => {
    let depositAmount = validatorDepositAmount.sub(ether('1'));
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: depositAmount,
    });
    poolId = getEntityId(pools.address, new BN(2));
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator,
      }),
      'Invalid pool ID.'
    );

    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, depositAmount);
    await checkCollectorBalance(
      pools,
      validatorDepositAmount.add(depositAmount)
    );
  });

  it('fails to register validator for the same pool twice', async () => {
    // Register validator first time
    await pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
      from: operator,
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(pools);

    // Register validator second time
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator,
      }),
      'Invalid pool ID.'
    );
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools);
    await checkCollectorBalance(pools);
  });

  it('allows transfer for periodic pools', async () => {
    // set staking duration for the periodic pool
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin,
    });

    // register validator
    await pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
      from: operator,
    });
    await checkPendingPool(pools, poolId, false);
    await checkCollectorBalance(pools);

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));
    expect(await validatorTransfers.checkTransferAllowed(poolId)).equal(true);
  });

  it('does not allow transfer for not periodic pools', async () => {
    // register validator
    await pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
      from: operator,
    });
    await checkPendingPool(pools, poolId, false);
    await checkCollectorBalance(pools);

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));
    expect(await validatorTransfers.checkTransferAllowed(poolId)).equal(false);
  });

  it('registers validators for pools with validator deposit amount collected', async () => {
    // one pool is already created
    let totalAmount = validatorDepositAmount;

    // create registrable pools
    let poolIds = [poolId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      await pools.addDeposit(recipient1, {
        from: sender1,
        value: validatorDepositAmount,
      });
      poolId = getEntityId(pools.address, new BN(i + 1));
      await checkPendingPool(pools, poolId, true);
      poolIds.push(poolId);
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(pools, totalAmount);
    await checkNewPoolCollectedAmount(pools);

    // register validators
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await pools.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        poolIds[i],
        {
          from: operator,
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      await checkPendingPool(pools, poolIds[i], false);
      await checkValidatorRegistered({
        vrc,
        validators,
        transaction: tx,
        entityId: poolIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: pools.address,
        signature: validatorRegistrationArgs[i].signature,
      });
    }
    await checkCollectorBalance(pools);
    await checkNewPoolCollectedAmount(pools);
  });
});
