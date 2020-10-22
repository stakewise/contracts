const { expect } = require('chai');
const {
  BN,
  ether,
  constants,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const { checkCollectorBalance, checkSoloDepositAdded } = require('../utils');

const Solos = artifacts.require('Solos');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Solos (add deposit)', ([_, ...accounts]) => {
  let solos, settings;
  let [admin, sender1, sender2] = accounts;

  beforeEach(async () => {
    let {
      solos: solosContractAddress,
      settings: settingsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
    });
    solos = await Solos.at(solosContractAddress);
    settings = await Settings.at(settingsContractAddress);
  });

  it('fails to add a deposit with invalid withdrawal credentials', async () => {
    await expectRevert(
      solos.addDeposit(constants.ZERO_BYTES32, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Solos: invalid withdrawal credentials'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit with invalid withdrawal credentials prefix', async () => {
    await expectRevert(
      solos.addDeposit(
        '0x9dfd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061',
        {
          from: sender1,
          value: validatorDepositAmount,
        }
      ),
      'Solos: invalid withdrawal credentials'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setPausedContracts(solos.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(solos.address)).equal(true);

    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Solos: contract is paused'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Solos: invalid deposit amount'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add too large deposit', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: new BN(initialSettings.maxDepositAmount).add(ether('1')),
      }),
      'Solos: deposit amount is too large'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit not divisible by validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).add(ether('1')),
      }),
      'Solos: invalid deposit amount'
    );
    await checkCollectorBalance(solos);
  });

  it('adds deposits divisible by validator deposit amount', async () => {
    let depositAmount = validatorDepositAmount.mul(new BN(3));
    // Send a deposit
    const receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: depositAmount,
    });

    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: depositAmount,
      totalAmount: depositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(3)));
  });

  it('increases amount for the same solo', async () => {
    // Send first deposit
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // Send second deposit
    receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount.mul(new BN(2)),
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // User 2 creates a deposit
    receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender2,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender2,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('creates different solos for deposits with different withdrawal withdrawal credentials', async () => {
    // User creates deposit with first withdrawal credential
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // User creates deposit with second withdrawal credential
    let withdrawalCredentials2 =
      '0x00ef3debe27bec735f68fee62c107f6a2bf85a4bb308cee64ce3a9addefa44f7';
    receipt = await solos.addDeposit(withdrawalCredentials2, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials: withdrawalCredentials2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });
});
