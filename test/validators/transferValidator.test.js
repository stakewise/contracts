const { expect } = require('chai');
const {
  BN,
  expectRevert,
  ether,
  balance
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
  checkValidatorTransferred,
  getEntityId,
  registerValidator
} = require('../common/utils');

const Privates = artifacts.require('Privates');
const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const validatorReward = ether('0.034871228');

contract('BaseCollector (transfer validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    validatorsRegistry,
    validatorTransfers,
    privates,
    pools,
    settings,
    walletsRegistry,
    validatorId,
    prevEntityId;
  let [admin, operator, walletsManager, sender, withdrawer, other] = accounts;

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
      vrc: vrc.options.address
    });
    privates = await Privates.at(proxies.privates);
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

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin
    });

    validatorId = await registerValidator({
      privatesProxy: proxies.privates,
      operator,
      sender: other,
      withdrawer: other
    });
    prevEntityId = await getEntityId(proxies.privates, new BN(1));
  });

  it('fails to transfer validator if there are no ready entities', async () => {
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, {
        from: operator
      }),
      'There are no ready entities.'
    );
  });

  it('fails to transfer validator with caller other than operator', async () => {
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, {
        from: other
      }),
      'Permission denied.'
    );
    // check balance didn't change
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator if transferring is paused', async () => {
    // pause validator transfers
    await validatorTransfers.setPaused(true, {
      from: admin
    });
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, {
        from: operator
      }),
      'Validator transfers are paused.'
    );
    // check balance didn't change
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator with updated deposit amount', async () => {
    // change validator deposit amount
    let newValidatorDepositAmount = validatorDepositAmount.add(ether('1'));
    await settings.setValidatorDepositAmount(newValidatorDepositAmount, {
      from: admin
    });
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: newValidatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, {
        from: operator
      }),
      'Validator deposit amount cannot be updated.'
    );
    // check balance didn't change
    await checkCollectorBalance(pools, newValidatorDepositAmount);
  });

  it('fails to transfer an unknown validator', async () => {
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      pools.transferValidator('0x0', validatorReward, {
        from: operator
      }),
      'Validator with such ID is not registered.'
    );
    // check balance didn't change
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator with assigned wallet', async () => {
    // assign wallet to the validator
    await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      pools.transferValidator(validatorId, validatorReward, {
        from: operator
      }),
      'Cannot register transfer for validator with assigned wallet.'
    );
    // check balance didn't change
    await checkCollectorBalance(pools, validatorDepositAmount);
  });

  it('fails to transfer validator to collector entity other than Pool', async () => {
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      privates.transferValidator(validatorId, validatorReward, {
        from: operator
      }),
      'Permission denied.'
    );
    // check balance didn't change
    await checkCollectorBalance(privates, validatorDepositAmount);
  });

  it('can transfer validator to the new entity', async () => {
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // transfer validator to the new entity
    let { tx } = await pools.transferValidator(validatorId, validatorReward, {
      from: operator
    });

    // check balance updated
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
      newEntityId: await getEntityId(pools.address, new BN(1)),
      newStakingDuration: stakingDuration,
      collectorAddress: pools.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt,
      totalUserDebt: userDebt,
      totalMaintainerDebt: maintainerDebt
    });

    // check ValidatorTransfers balance
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount);
  });

  it('updates maintainer fee for transferred validator', async () => {
    // register new ready entity
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // update maintainer fee
    let newMaintainerFee = new BN(2234);
    await settings.setMaintainerFee(newMaintainerFee, {
      from: admin
    });

    // transfer validator to the new entity
    let { tx } = await pools.transferValidator(validatorId, validatorReward, {
      from: operator
    });

    // check balance updated
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
      newEntityId: await getEntityId(pools.address, new BN(1)),
      newStakingDuration: stakingDuration,
      collectorAddress: pools.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt,
      totalUserDebt: userDebt,
      totalMaintainerDebt: maintainerDebt
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
        maintainerDebt: ether('0.0231289486576')
      },
      {
        newMaintainerFee: new BN(2000),
        // subtracts previous test validatorReward
        validatorReward: ether('0.5901925'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.1405585686'),
        maintainerDebt: ether('0.00739781940')
      },
      {
        newMaintainerFee: new BN(1),
        // subtracts previous test validatorReward
        validatorReward: ether('0.802677173'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.1699877384'),
        maintainerDebt: ether('0.0424969346')
      },
      {
        newMaintainerFee: new BN(4999),
        // subtracts previous test validatorReward
        validatorReward: ether('7.278412149'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('6.4750874025024'),
        maintainerDebt: ether('0.0006475734976')
      },
      {
        newMaintainerFee: new BN(9999),
        // subtracts previous test validatorReward
        validatorReward: ether('8.017862337'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.3697990390188'),
        maintainerDebt: ether('0.3696511489812')
      }
    ];

    let tx;
    let expectedBalance = new BN(0);
    let totalUserDebt = new BN(0);
    let totalMaintainerDebt = new BN(0);
    let entityCounter = new BN(0);

    for (const test of tests) {
      // register new ready entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // update maintainer fee
      await settings.setMaintainerFee(test.newMaintainerFee, {
        from: admin
      });

      // transfer validator to the new entity
      ({ tx } = await pools.transferValidator(
        validatorId,
        test.validatorReward,
        {
          from: operator
        }
      ));

      // check balance updated
      await checkCollectorBalance(pools, new BN(0));

      // increment balance and debts
      expectedBalance.iadd(validatorDepositAmount);
      totalUserDebt.iadd(test.userDebt);
      totalMaintainerDebt.iadd(test.maintainerDebt);
      entityCounter.iadd(new BN(1));

      let newEntityId = getEntityId(pools.address, entityCounter);
      // check validator transferred
      await checkValidatorTransferred({
        transaction: tx,
        validatorId,
        newMaintainerFee: test.newMaintainerFee,
        prevEntityId,
        newEntityId,
        newStakingDuration: stakingDuration,
        collectorAddress: privates.address,
        validatorsRegistry,
        validatorTransfers,
        userDebt: test.userDebt,
        maintainerDebt: test.maintainerDebt,
        totalUserDebt: totalUserDebt,
        totalMaintainerDebt: totalMaintainerDebt
      });

      // check Validator Transfers balance
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(expectedBalance);
      prevEntityId = newEntityId;
    }
  });
});
