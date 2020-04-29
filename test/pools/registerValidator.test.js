const {
  BN,
  expectRevert,
  constants,
  ether
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingPool,
  checkValidatorRegistered,
  getDepositAmount,
  validatorRegistrationArgs,
  checkNewPoolCollectedAmount,
  getEntityId
} = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN(86400);

contract('Pools (register validator)', ([_, ...accounts]) => {
  let networkConfig, vrc, pools, validatorsRegistry, poolId;
  let [
    admin,
    operator,
    sender1,
    recipient1,
    sender2,
    recipient2,
    other
  ] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let {
      pools: poolsProxy,
      operators: operatorsProxy,
      validatorsRegistry: validatorsRegistryProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    pools = await Pools.at(poolsProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin
    });

    // register pool
    let amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2))
    });
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: amount1
    });

    let amount2 = validatorDepositAmount.sub(amount1);
    await pools.addDeposit(recipient2, {
      from: sender2,
      value: amount2
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
          from: operator
        }
      ),
      'Invalid pool ID.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: other
      }),
      'Permission denied.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
      from: operator
    });
    await checkPendingPool(pools, poolId, false);
    await checkCollectorBalance(pools, new BN(0));

    // create new pool
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: validatorDepositAmount
    });
    poolId = getEntityId(pools.address, new BN(2));

    // Register validator 2 with the same validator public key
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator
      }),
      'Public key has been already used.'
    );
    await checkPendingPool(pools, poolId, true);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to register validator for pool which did not collect validator deposit amount', async () => {
    let depositAmount = validatorDepositAmount.sub(ether('1'));
    await pools.addDeposit(recipient1, {
      from: sender1,
      value: depositAmount
    });
    poolId = getEntityId(pools.address, new BN(2));
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator
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
      from: operator
    });
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, new BN(0));

    // Register validator second time
    await expectRevert(
      pools.registerValidator(pubKey, signature, hashTreeRoot, poolId, {
        from: operator
      }),
      'Invalid pool ID.'
    );
    await checkPendingPool(pools, poolId, false);
    await checkNewPoolCollectedAmount(pools, new BN(0));
    await checkCollectorBalance(pools, new BN(0));
  });

  it('registers validators for pools with validator deposit amount collected', async () => {
    // one pool is already created
    let totalAmount = validatorDepositAmount;

    // create registrable pools
    let poolIds = [poolId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      await pools.addDeposit(recipient1, {
        from: sender1,
        value: validatorDepositAmount
      });
      poolId = getEntityId(pools.address, new BN(i + 1));
      await checkPendingPool(pools, poolId, true);
      poolIds.push(poolId);
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(pools, totalAmount);
    await checkNewPoolCollectedAmount(pools, new BN(0));

    // register validators
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await pools.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        poolIds[i],
        {
          from: operator
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      await checkPendingPool(pools, poolIds[i], false);
      await checkValidatorRegistered({
        vrc,
        stakingDuration,
        transaction: tx,
        entityId: poolIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: pools.address,
        validatorsRegistry: validatorsRegistry,
        signature: validatorRegistrationArgs[i].signature
      });
    }
    await checkCollectorBalance(pools, new BN(0));
    await checkNewPoolCollectedAmount(pools, new BN(0));
  });
});
