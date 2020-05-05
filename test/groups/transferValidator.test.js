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
  checkPendingGroup,
  checkValidatorTransferred,
  getEntityId,
  registerValidator,
} = require('../common/utils');

const Groups = artifacts.require('Groups');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const validatorReward = ether('0.034871228');

contract('Groups (transfer validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    validatorsRegistry,
    validatorTransfers,
    groups,
    settings,
    validatorId,
    newGroupId,
    prevEntityId;
  let [admin, operator, other, sender, recipient] = accounts;

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
    groups = await Groups.at(proxies.groups);
    validatorsRegistry = await ValidatorsRegistry.at(
      proxies.validatorsRegistry
    );
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(groups.address, stakingDuration, {
      from: admin,
    });

    // register validator to transfer
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      recipient: other,
    });
    prevEntityId = getEntityId(proxies.pools, new BN(1));

    // register new group
    await groups.createGroup([other], {
      from: sender,
    });
    newGroupId = getEntityId(groups.address, new BN(1));
    await groups.addDeposit(newGroupId, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
  });

  it('fails to transfer validator to an invalid group', async () => {
    await expectRevert(
      groups.transferValidator(
        validatorId,
        validatorReward,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingGroup(groups, newGroupId, validatorDepositAmount);
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to transfer invalid validator to the new group', async () => {
    await expectRevert(
      groups.transferValidator(
        constants.ZERO_BYTES32,
        validatorReward,
        newGroupId,
        {
          from: operator,
        }
      ),
      'Validator with such ID is not registered.'
    );
    await checkPendingGroup(groups, newGroupId, validatorDepositAmount);
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to transfer validator with caller other than operator', async () => {
    await expectRevert(
      groups.transferValidator(validatorId, validatorReward, newGroupId, {
        from: other,
      }),
      'Permission denied.'
    );
    await checkPendingGroup(groups, newGroupId, validatorDepositAmount);
    await checkCollectorBalance(groups, validatorDepositAmount);
  });

  it('fails to transfer validator with updated deposit amount', async () => {
    // change validator deposit amount
    let newValidatorDepositAmount = validatorDepositAmount.add(ether('1'));
    await settings.setValidatorDepositAmount(newValidatorDepositAmount, {
      from: admin,
    });

    // register new group
    await groups.createGroup([other], {
      from: sender,
    });
    newGroupId = getEntityId(groups.address, new BN(2));
    await groups.addDeposit(newGroupId, recipient, {
      from: sender,
      value: newValidatorDepositAmount,
    });

    // transfer validator to the new group
    await expectRevert(
      groups.transferValidator(validatorId, validatorReward, newGroupId, {
        from: operator,
      }),
      'Validator deposit amount cannot be updated.'
    );

    // check balance didn't change
    await checkPendingGroup(groups, newGroupId, newValidatorDepositAmount);
    await checkCollectorBalance(
      groups,
      newValidatorDepositAmount.add(validatorDepositAmount)
    );
  });

  it('can transfer validator to the new group', async () => {
    // transfer validator to the new group
    let { tx } = await groups.transferValidator(
      validatorId,
      validatorReward,
      newGroupId,
      {
        from: operator,
      }
    );

    // check balance updated
    await checkPendingGroup(groups, newGroupId, new BN(0));

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
      newEntityId: newGroupId,
      newStakingDuration: stakingDuration,
      collectorAddress: groups.address,
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
    // transfer validator to the new group
    let { tx } = await groups.transferValidator(
      validatorId,
      validatorReward,
      newGroupId,
      {
        from: operator,
      }
    );

    // check balance updated
    await checkPendingGroup(groups, newGroupId, new BN(0));

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
      newEntityId: newGroupId,
      newStakingDuration: stakingDuration,
      collectorAddress: groups.address,
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
    let groupsCount = new BN(1);

    for (const test of tests) {
      // update maintainer fee
      await settings.setMaintainerFee(test.newMaintainerFee, {
        from: admin,
      });

      // transfer validator to the new group
      ({ tx } = await groups.transferValidator(
        validatorId,
        test.validatorReward,
        newGroupId,
        {
          from: operator,
        }
      ));

      // check balance updated
      await checkPendingGroup(groups, newGroupId, new BN(0));

      // increment balance and debts
      expectedBalance.iadd(validatorDepositAmount);
      totalUserDebt.iadd(test.userDebt);
      totalMaintainerDebt.iadd(test.maintainerDebt);
      groupsCount.iadd(new BN(1));

      // check validator transferred
      await checkValidatorTransferred({
        transaction: tx,
        validatorId,
        newMaintainerFee: test.newMaintainerFee,
        prevEntityId,
        newEntityId: newGroupId,
        newStakingDuration: stakingDuration,
        collectorAddress: groups.address,
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
      prevEntityId = newGroupId;

      // add deposit for the next group
      await groups.createGroup([other], {
        from: sender,
      });
      newGroupId = getEntityId(groups.address, groupsCount);
      await groups.addDeposit(newGroupId, recipient, {
        from: sender,
        value: validatorDepositAmount,
      });
    }
  });
});
