const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  ether,
  balance,
  time,
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
  checkPendingSolo,
  checkValidatorTransferred,
  getEntityId,
  registerValidator,
  signValidatorTransfer,
} = require('../common/utils');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
const validatorReward = ether('0.034871228');
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Solos (transfer validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    dai,
    validators,
    validatorTransfers,
    solos,
    settings,
    validatorId,
    newSoloId,
    prevEntityId,
    prevEntityManagerSignature;
  let [admin, operator, other, sender, recipient] = accounts;

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
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    solos = await Solos.at(proxies.solos);
    validators = await Validators.at(proxies.validators);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(solos.address, stakingDuration, {
      from: admin,
    });

    await settings.setStakingDuration(proxies.pools, stakingDuration, {
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
    prevEntityManagerSignature = constants.ZERO_BYTES32;

    // register new solo
    newSoloId = getEntityId(solos.address, new BN(1));
    await solos.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
  });

  it('fails to transfer validator to an invalid solo', async () => {
    await expectRevert(
      solos.transferValidator(
        validatorId,
        validatorReward,
        constants.ZERO_BYTES32,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to transfer invalid validator to the new solo', async () => {
    await expectRevert(
      solos.transferValidator(
        constants.ZERO_BYTES32,
        validatorReward,
        newSoloId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ),
      'Validator transfer is not allowed.'
    );
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to transfer validator with caller other than operator', async () => {
    await expectRevert(
      solos.transferValidator(
        validatorId,
        validatorReward,
        newSoloId,
        prevEntityManagerSignature,
        {
          from: other,
        }
      ),
      'Permission denied.'
    );
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to transfer validator if staking time has not passed', async () => {
    await expectRevert(
      solos.transferValidator(
        validatorId,
        validatorReward,
        newSoloId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ),
      'Validator transfer is not allowed.'
    );
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to transfer validator with updated deposit amount', async () => {
    // change validator deposit amount
    let newValidatorDepositAmount = validatorDepositAmount.add(ether('1'));
    await settings.setValidatorDepositAmount(newValidatorDepositAmount, {
      from: admin,
    });

    // register new solo
    await solos.addDeposit(recipient, {
      from: sender,
      value: newValidatorDepositAmount,
    });

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));

    // transfer validator to the new solo
    newSoloId = getEntityId(solos.address, new BN(2));
    await expectRevert(
      solos.transferValidator(
        validatorId,
        validatorReward,
        newSoloId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ),
      'Validator deposit amount cannot be updated.'
    );

    await checkPendingSolo({
      solos,
      soloId: newSoloId,
      amount: newValidatorDepositAmount,
    });
    await checkCollectorBalance(
      solos,
      newValidatorDepositAmount.add(validatorDepositAmount)
    );
  });

  it('fails to transfer validator to private solo', async () => {
    // register new private solo
    await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender,
      value: validatorDepositAmount,
    });
    let privateSoloId = getEntityId(solos.address, new BN(2));

    // transfer validator to the new solo
    await expectRevert(
      solos.transferValidator(
        validatorId,
        validatorReward,
        privateSoloId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ),
      'Cannot transfer to the private solo.'
    );

    await checkPendingSolo({
      solos,
      soloId: privateSoloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    // multiply by 2 as there is already one solo deposit in contract
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('can transfer validator to the new solo', async () => {
    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));

    // transfer validator to the new solo
    let { tx } = await solos.transferValidator(
      validatorId,
      validatorReward,
      newSoloId,
      prevEntityManagerSignature,
      {
        from: operator,
      }
    );

    // check pending solo removed
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
    });

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
      newEntityId: newSoloId,
      newStakingDuration: stakingDuration,
      collectorAddress: solos.address,
      validators,
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

    // check whether new solo can transfer as well
    await time.increase(time.duration.seconds(stakingDuration));
    expect(await validatorTransfers.checkTransferAllowed(newSoloId)).equal(
      true
    );
  });

  it('updates maintainer fee for transferred validator', async () => {
    // update maintainer fee
    let newMaintainerFee = new BN(2234);
    await settings.setMaintainerFee(newMaintainerFee, {
      from: admin,
    });

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));

    // transfer validator to the new solo
    let { tx } = await solos.transferValidator(
      validatorId,
      validatorReward,
      newSoloId,
      prevEntityManagerSignature,
      {
        from: operator,
      }
    );

    // check pending solo removed
    await checkPendingSolo({
      solos,
      soloId: newSoloId,
    });

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
      newEntityId: newSoloId,
      newStakingDuration: stakingDuration,
      collectorAddress: solos.address,
      validators,
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
    let solosCount = new BN(1);

    for (const test of tests) {
      // update maintainer fee
      await settings.setMaintainerFee(test.newMaintainerFee, {
        from: admin,
      });

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(stakingDuration));

      // transfer validator to the new solo
      ({ tx } = await solos.transferValidator(
        validatorId,
        test.validatorReward,
        newSoloId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      ));

      // check pending solo removed
      await checkPendingSolo({
        solos,
        soloId: newSoloId,
      });

      // increment balance and debts
      expectedBalance.iadd(validatorDepositAmount);
      totalUserDebt.iadd(test.userDebt);
      totalMaintainerDebt.iadd(test.maintainerDebt);
      solosCount.iadd(new BN(1));

      // check validator transferred
      await checkValidatorTransferred({
        transaction: tx,
        validatorId,
        newMaintainerFee: test.newMaintainerFee,
        prevEntityId,
        newEntityId: newSoloId,
        newStakingDuration: stakingDuration,
        collectorAddress: solos.address,
        validators,
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

      prevEntityId = newSoloId;
      prevEntityManagerSignature = await signValidatorTransfer(
        sender,
        prevEntityId
      );

      // add deposit for the next solo
      newSoloId = getEntityId(solos.address, solosCount);
      await solos.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });
    }
  });
});
