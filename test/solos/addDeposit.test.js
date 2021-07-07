const { expect } = require('chai');
const {
  BN,
  ether,
  constants,
  expectRevert,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkCollectorBalance,
  checkSoloDepositAdded,
} = require('../utils');

const Solos = artifacts.require('Solos');

const validatorDeposit = ether('32');
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Solos (add deposit)', ([sender1, sender2]) => {
  const admin = contractSettings.solosAdmin;
  let solos;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender1, admin, ether('5'));

    await upgradeContracts();

    solos = await Solos.at(contracts.solos);
  });

  afterEach(async () => resetFork());

  it('fails to add a deposit with invalid withdrawal credentials', async () => {
    await expectRevert(
      solos.addDeposit(constants.ZERO_BYTES32, {
        from: sender1,
        value: validatorDeposit,
      }),
      'Solos: invalid credentials'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit with invalid withdrawal credentials prefix', async () => {
    await expectRevert(
      solos.addDeposit(
        '0x9dfd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061',
        {
          from: sender1,
          value: validatorDeposit,
        }
      ),
      'Solos: invalid credentials'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit to paused contract', async () => {
    await solos.pause({ from: admin });
    expect(await solos.paused()).equal(true);

    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: validatorDeposit,
      }),
      'Pausable: paused'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: validatorDeposit.sub(ether('1')),
      }),
      'Solos: invalid deposit amount'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit not divisible by validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalCredentials, {
        from: sender1,
        value: validatorDeposit.add(ether('1')),
      }),
      'Solos: invalid deposit amount'
    );
    await checkCollectorBalance(solos);
  });

  it('adds deposits divisible by validator deposit amount', async () => {
    let depositAmount = validatorDeposit.mul(new BN(3));
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
    await checkCollectorBalance(solos, validatorDeposit.mul(new BN(3)));
  });

  it('increases amount for the same solo', async () => {
    // Send first deposit
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);

    // Send second deposit
    receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit.mul(new BN(2)),
    });
    await checkCollectorBalance(solos, validatorDeposit.mul(new BN(2)));
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);

    // User 2 creates a deposit
    receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender2,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender2,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit.mul(new BN(2)));
  });

  it('creates different solos for deposits with different withdrawal credentials', async () => {
    // User creates deposit with first withdrawal credential
    let receipt = await solos.addDeposit(withdrawalCredentials, {
      from: sender1,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit);

    // User creates deposit with second withdrawal credential
    let withdrawalCredentials2 =
      '0x00ef3debe27bec735f68fee62c107f6a2bf85a4bb308cee64ce3a9addefa44f7';
    receipt = await solos.addDeposit(withdrawalCredentials2, {
      from: sender1,
      value: validatorDeposit,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      solos,
      withdrawalCredentials: withdrawalCredentials2,
      addedAmount: validatorDeposit,
      totalAmount: validatorDeposit,
    });
    await checkCollectorBalance(solos, validatorDeposit.mul(new BN(2)));
  });
});
