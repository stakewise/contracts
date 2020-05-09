const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  ether,
  balance,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkPendingPool,
  checkValidatorTransferred,
  getEntityId,
  registerValidator,
  getDepositAmount,
} = require('../common/utils');

const Individuals = artifacts.require('Individuals');
const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const validatorReward = ether('0.034871228');

contract('Pools (transfer validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    validatorsRegistry,
    validatorTransfers,
    individuals,
    pools,
    settings,
    walletsRegistry,
    validatorId,
    newPoolId,
    prevEntityId;
  let [admin, operator, manager, other, sender1, sender2] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    individuals = await Individuals.at(proxies.individuals);
    pools = await Pools.at(proxies.pools);
    validatorsRegistry = await ValidatorsRegistry.at(
      proxies.validatorsRegistry
    );
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin,
    });

    // register validator to transfer
    validatorId = await registerValidator({
      individualsProxy: proxies.individuals,
      operator,
      sender: other,
      recipient: other,
    });
    prevEntityId = getEntityId(proxies.individuals, new BN(1));

    // register new pool
    let amount1 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pools.addDeposit(sender1, {
      from: sender1,
      value: amount1,
    });

    let amount2 = validatorDepositAmount.sub(amount1);
    await pools.addDeposit(sender2, {
      from: sender2,
      value: amount2,
    });
    newPoolId = getEntityId(pools.address, new BN(1));
  });

  it('fails to transfer validator to an invalid pool', async () => {
    await expectRevert(
      pools.transferValidator(
        validatorId,
        validatorReward,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Invalid pool ID.'
    );
  });

  it('fails to transfer invalid validator to the new pool', async () => {
    await expectRevert(
      pools.transferValidator(
        constants.ZERO_BYTES32,
        validatorReward,
        newPoolId,
        {
          from: operator,
        }
      ),
      'Validator with such ID is not registered.'
    );
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator with caller other than operator', async () => {
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, newPoolId, {
        from: other,
      }),
      'Permission denied.'
    );
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator if transferring is paused', async () => {
    // pause validator transfers
    await settings.setContractPaused(validatorTransfers.address, true, {
      from: admin,
    });

    // transfer validator to the new pool
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, newPoolId, {
        from: operator,
      }),
      'Validator transfers are paused.'
    );

    // check balance didn't change
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator with updated deposit amount', async () => {
    // change validator deposit amount
    let newValidatorDepositAmount = validatorDepositAmount.add(ether('1'));
    await settings.setValidatorDepositAmount(newValidatorDepositAmount, {
      from: admin,
    });

    // register new pool
    await pools.addDeposit(sender1, {
      from: sender1,
      value: newValidatorDepositAmount,
    });
    newPoolId = getEntityId(pools.address, new BN(2));

    // transfer validator to the new pool
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, newPoolId, {
        from: operator,
      }),
      'Validator deposit amount cannot be updated.'
    );

    // check balance didn't change
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(
      pools,
      newValidatorDepositAmount.add(validatorDepositAmount)
    );
  });

  it('fails to transfer validator with assigned wallet', async () => {
    // assign wallet to the validator
    await walletsRegistry.assignWallet(validatorId, {
      from: manager,
    });

    // transfer validator to the new pool
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, newPoolId, {
        from: operator,
      }),
      'Cannot register transfer for validator with assigned wallet.'
    );

    // check balance didn't change
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator when transfers are paused', async () => {
    await settings.setContractPaused(validatorTransfers.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(validatorTransfers.address)).equal(
      true
    );

    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, newPoolId, {
        from: operator,
      }),
      'Validator transfers are paused.'
    );

    // check balance didn't change
    await checkPendingPool(pools, newPoolId, true);
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('can transfer validator to the new pool', async () => {
    // transfer validator to the new pool
    let { tx } = await pools.transferValidator(
      validatorId,
      validatorReward,
      newPoolId,
      {
        from: operator,
      }
    );

    // check balance updated
    await checkPendingPool(pools, newPoolId, false);
    await checkCollectorBalance(pools, new BN(0));

    // calculate debts
    let maintainerDebt = validatorReward
      .mul(new BN(initialSettings.maintainerFee))
      .div(new BN(10000));
    let userDebt = validatorReward.sub(maintainerDebt);

    // check validator transferred
    await checkValidatorTransferred({
      transaction: tx,
      validatorId,
      prevEntityId,
      newEntityId: newPoolId,
      newStakingDuration: stakingDuration,
      collectorAddress: pools.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt,
      totalUserDebt: userDebt,
      totalMaintainerDebt: maintainerDebt,
    });

    // check ValidatorTransfers balance
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount);
  });

  it('updates maintainer fee for transferred validator', async () => {
    // update maintainer fee
    let newMaintainerFee = new BN(2234);
    await settings.setMaintainerFee(newMaintainerFee, {
      from: admin,
    });
    // transfer validator to the new pool
    let { tx } = await pools.transferValidator(
      validatorId,
      validatorReward,
      newPoolId,
      {
        from: operator,
      }
    );

    // check balance updated
    await checkPendingPool(pools, newPoolId, false);
    await checkCollectorBalance(pools, new BN(0));

    // calculate debts
    let maintainerDebt = validatorReward
      .mul(new BN(initialSettings.maintainerFee))
      .div(new BN(10000));
    let userDebt = validatorReward.sub(maintainerDebt);

    // check validator transferred
    await checkValidatorTransferred({
      transaction: tx,
      validatorId,
      newMaintainerFee,
      prevEntityId,
      newEntityId: newPoolId,
      newStakingDuration: stakingDuration,
      collectorAddress: pools.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt,
      totalUserDebt: userDebt,
      totalMaintainerDebt: maintainerDebt,
    });

    // check Validator Transfers balance
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount);
  });

  it('calculates debts correctly for entities transferred from validator', async () => {
    let tests = [
      {
        newMaintainerFee: new BN(500),
        validatorReward: ether('0.442236112'),
        // debts are based on initialSettings.maintainerFee
        userDebt: ether('0.4191071633424'),
        maintainerDebt: ether('0.0231289486576'),
      },
      {
        newMaintainerFee: new BN(2000),
        // subtracts previous test validatorReward
        validatorReward: ether('0.5901925'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.1405585686'),
        maintainerDebt: ether('0.00739781940'),
      },
      {
        newMaintainerFee: new BN(1),
        // subtracts previous test validatorReward
        validatorReward: ether('0.802677173'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.1699877384'),
        maintainerDebt: ether('0.0424969346'),
      },
      {
        newMaintainerFee: new BN(4999),
        // subtracts previous test validatorReward
        validatorReward: ether('7.278412149'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('6.4750874025024'),
        maintainerDebt: ether('0.0006475734976'),
      },
      {
        newMaintainerFee: new BN(9999),
        // subtracts previous test validatorReward
        validatorReward: ether('8.017862337'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.3697990390188'),
        maintainerDebt: ether('0.3696511489812'),
      },
    ];

    let tx;
    let expectedBalance = new BN(0);
    let totalUserDebt = new BN(0);
    let totalMaintainerDebt = new BN(0);
    let poolsCount = new BN(1);

    for (const test of tests) {
      // update maintainer fee
      await settings.setMaintainerFee(test.newMaintainerFee, {
        from: admin,
      });

      // transfer validator to the new pool
      ({ tx } = await pools.transferValidator(
        validatorId,
        test.validatorReward,
        newPoolId,
        {
          from: operator,
        }
      ));

      // check balance updated
      await checkPendingPool(pools, newPoolId, false);
      await checkCollectorBalance(pools, new BN(0));

      // increment balance and debts
      expectedBalance.iadd(validatorDepositAmount);
      totalUserDebt.iadd(test.userDebt);
      totalMaintainerDebt.iadd(test.maintainerDebt);
      poolsCount.iadd(new BN(1));

      // check validator transferred
      await checkValidatorTransferred({
        transaction: tx,
        validatorId,
        newMaintainerFee: test.newMaintainerFee,
        prevEntityId,
        newEntityId: newPoolId,
        newStakingDuration: stakingDuration,
        collectorAddress: individuals.address,
        validatorsRegistry,
        validatorTransfers,
        userDebt: test.userDebt,
        maintainerDebt: test.maintainerDebt,
        totalUserDebt: totalUserDebt,
        totalMaintainerDebt: totalMaintainerDebt,
      });

      // check Validator Transfers balance
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(expectedBalance);
      prevEntityId = newPoolId;
      newPoolId = getEntityId(pools.address, poolsCount);

      // add deposit for the next pool
      await pools.addDeposit(sender1, {
        from: sender1,
        value: validatorDepositAmount,
      });
    }
  });
});
