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
  registerValidator
} = require('../utils');

const Privates = artifacts.require('Privates');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const currentReward = ether('0.034871228');

contract('Transfer Validator', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    validatorsRegistry,
    validatorTransfers,
    privates,
    settings,
    walletsRegistry,
    validatorId;
  let [
    admin,
    operator,
    transfersManager,
    walletsManager,
    sender,
    withdrawer,
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
      privates: privatesProxy,
      operators: operatorsProxy,
      walletsManagers: walletsManagersProxy,
      validatorsRegistry: validatorsRegistryProxy,
      validatorTransfers: validatorTransfersProxy,
      walletsRegistry: walletsRegistryProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    privates = await Privates.at(privatesProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransfersProxy);
    walletsRegistry = await WalletsRegistry.at(walletsRegistryProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(walletsManagersProxy);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set staking duration
    settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(privates.address, stakingDuration, {
      from: admin
    });

    validatorId = await registerValidator({
      privatesProxy,
      operator,
      sender: other,
      withdrawer: other
    });
  });

  it('fails to transfer validator if there are no ready entities', async () => {
    await expectRevert(
      privates.transferValidator(validatorId, currentReward, {
        from: transfersManager
      }),
      'There are no ready entities.'
    );
  });

  it('fails to transfer validator with caller other than manager', async () => {
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      privates.transferValidator(validatorId, currentReward, {
        from: other
      }),
      'Permission denied.'
    );
    // check balance didn't change
    await checkCollectorBalance(privates, validatorDepositAmount);
  });

  it('fails to transfer validator with updated deposit amount', async () => {
    // change validator deposit amount
    let newValidatorDepositAmount = validatorDepositAmount.add(ether('1'));
    await settings.setValidatorDepositAmount(newValidatorDepositAmount, {
      from: admin
    });
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: newValidatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      privates.transferValidator(validatorId, currentReward, {
        from: transfersManager
      }),
      'Validator deposit amount cannot be updated.'
    );
    // check balance didn't change
    await checkCollectorBalance(privates, newValidatorDepositAmount);
  });

  it('fails to transfer an unknown validator', async () => {
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      privates.transferValidator('0x0', currentReward, {
        from: transfersManager
      }),
      'Validator deposit amount cannot be updated.'
    );
    // check balance didn't change
    await checkCollectorBalance(privates, validatorDepositAmount);
  });

  it('fails to transfer validator with assigned wallet', async () => {
    // assign wallet to the validator
    await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });
    // transfer validator to the new entity
    await expectRevert(
      privates.transferValidator(validatorId, currentReward, {
        from: transfersManager
      }),
      'Cannot register transfer for validator with assigned wallet.'
    );
    // check balance didn't change
    await checkCollectorBalance(privates, validatorDepositAmount);
  });

  it('can transfer validator to the new entity', async () => {
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // transfer validator to the new entity
    let { tx } = await privates.transferValidator(validatorId, currentReward, {
      from: transfersManager
    });

    // check balance updated
    await checkCollectorBalance(privates, new BN(0));

    // calculate debts
    let maintainerDebt = currentReward
      .mul(new BN(initialSettings.maintainerFee))
      .div(new BN(10000));
    let userDebt = currentReward.sub(maintainerDebt);

    // check validator transferred
    await checkValidatorTransferred({
      transaction: tx,
      validatorId,
      prevEntityId: new BN(1),
      newEntityId: new BN(2),
      newStakingDuration: stakingDuration,
      collectorAddress: privates.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt
    });

    // check ValidatorTransfers balance
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(validatorDepositAmount);
  });

  it('updates maintainer fee for transferred validator', async () => {
    // register new ready entity
    await privates.addDeposit(withdrawer, {
      from: sender,
      value: validatorDepositAmount
    });

    // update maintainer fee
    let newMaintainerFee = new BN(2234);
    await settings.setMaintainerFee(newMaintainerFee, {
      from: admin
    });

    // transfer validator to the new entity
    let { tx } = await privates.transferValidator(validatorId, currentReward, {
      from: transfersManager
    });

    // check balance updated
    await checkCollectorBalance(privates, new BN(0));

    // calculate debts
    let maintainerDebt = currentReward
      .mul(new BN(initialSettings.maintainerFee))
      .div(new BN(10000));
    let userDebt = currentReward.sub(maintainerDebt);

    // check validator transferred
    await checkValidatorTransferred({
      transaction: tx,
      validatorId,
      newMaintainerFee,
      prevEntityId: new BN(1),
      newEntityId: new BN(2),
      newStakingDuration: stakingDuration,
      collectorAddress: privates.address,
      validatorsRegistry,
      validatorTransfers,
      userDebt,
      maintainerDebt
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
        currentReward: ether('0.442236112'),
        // debts are based on initialSettings.maintainerFee
        userDebt: ether('0.4191071633424'),
        maintainerDebt: ether('0.0231289486576')
      },
      {
        newMaintainerFee: new BN(2000),
        currentReward: ether('0.5901925'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.560682875'),
        maintainerDebt: ether('0.029509625')
      },
      {
        newMaintainerFee: new BN(1),
        currentReward: ether('0.802677173'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.6421417384'),
        maintainerDebt: ether('0.1605354346')
      },
      {
        newMaintainerFee: new BN(4999),
        currentReward: ether('7.278412149'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('7.2776843077851'),
        maintainerDebt: ether('0.0007278412149')
      },
      {
        newMaintainerFee: new BN(9999),
        currentReward: ether('0.017862337'),
        // debts are based on previous test newMaintainerFee
        userDebt: ether('0.0089329547337'),
        maintainerDebt: ether('0.0089293822663')
      }
    ];

    let tx;
    let expectedBalance = new BN(0);
    let entityCounter = new BN(1);
    let expectedUserDebt = new BN(0);
    let expectedMaintainerDebt = new BN(0);
    for (const test of tests) {
      // register new ready entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // update maintainer fee
      await settings.setMaintainerFee(test.newMaintainerFee, {
        from: admin
      });

      // transfer validator to the new entity
      ({ tx } = await privates.transferValidator(
        validatorId,
        test.currentReward,
        {
          from: transfersManager
        }
      ));

      // check balance updated
      await checkCollectorBalance(privates, new BN(0));

      // increment balance and debts
      expectedBalance.iadd(validatorDepositAmount);
      expectedUserDebt.iadd(test.userDebt);
      expectedMaintainerDebt.iadd(test.maintainerDebt);

      // check validator transferred
      await checkValidatorTransferred({
        transaction: tx,
        validatorId,
        newMaintainerFee: test.newMaintainerFee,
        prevEntityId: entityCounter,
        newEntityId: entityCounter.add(new BN(1)),
        newStakingDuration: stakingDuration,
        collectorAddress: privates.address,
        validatorsRegistry,
        validatorTransfers,
        userDebt: expectedUserDebt,
        maintainerDebt: expectedMaintainerDebt
      });

      // check Validator Transfers balance
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(expectedBalance);

      // increment entity counter
      entityCounter.iadd(new BN(1));
    }
  });
});
