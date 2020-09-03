const { expect } = require('chai');
const {
  BN,
  ether,
  constants,
  expectRevert,
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
  checkSoloDepositAdded,
} = require('../common/utils');

const Solos = artifacts.require('Solos');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';

contract('Solos (add deposit)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, solos, settings;
  let [admin, sender1, sender2] = accounts;

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
    let { solos: solosProxy, settings: settingsProxy } = await deployAllProxies(
      {
        initialAdmin: admin,
        networkConfig,
        vrc: vrc.options.address,
        dai: dai.address,
      }
    );
    solos = await Solos.at(solosProxy);
    settings = await Settings.at(settingsProxy);
  });

  it('fails to add a deposit with an invalid withdrawal public key', async () => {
    await expectRevert(
      solos.addDeposit(constants.ZERO_BYTES32, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Solos: invalid BLS withdrawal public key'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit to paused contract', async () => {
    await settings.setContractPaused(solos.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(solos.address)).equal(true);

    await expectRevert(
      solos.addDeposit(withdrawalPublicKey, {
        from: sender1,
        value: validatorDepositAmount,
      }),
      'Solos: contract is paused'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit smaller than validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalPublicKey, {
        from: sender1,
        value: new BN(initialSettings.validatorDepositAmount).sub(ether('1')),
      }),
      'Solos: invalid deposit amount'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add too large deposit', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalPublicKey, {
        from: sender1,
        value: new BN(initialSettings.maxDepositAmount).add(ether('1')),
      }),
      'Solos: deposit amount is too large'
    );
    await checkCollectorBalance(solos);
  });

  it('fails to add a deposit not divisible by validator deposit amount', async () => {
    await expectRevert(
      solos.addDeposit(withdrawalPublicKey, {
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
    const receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender1,
      value: depositAmount,
    });
    let payments = receipt.logs[0].args.payments;

    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: depositAmount,
      totalAmount: depositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(3)));
  });

  it('increases amount for the same solo', async () => {
    // Send first deposit
    let receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });
    let payments = receipt.logs[0].args.payments;

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // Send second deposit
    receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount.mul(new BN(2)),
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });
    let payments1 = receipt.logs[0].args.payments;

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments: payments1,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // User 2 creates a deposit
    receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender2,
      value: validatorDepositAmount,
    });
    let payments2 = receipt.logs[0].args.payments;

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender2,
      payments: payments2,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });

  it('creates different solos for deposits with different withdrawal public keys', async () => {
    // User creates deposit with first withdrawal public key
    let receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender1,
      value: validatorDepositAmount,
    });
    let payments = receipt.logs[0].args.payments;

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments,
      solos,
      withdrawalPublicKey,
      withdrawalCredentials,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // User creates deposit with second withdrawal public key
    let withdrawalPublicKey2 =
      '0x951565d421cf696f51bea29b76be8aa4fd4c12be334b7f6621902dccdea79144518864bf89cb1801eedb65d8d320fb89';
    let withdrawalCredentials2 =
      '0x00ef3debe27bec735f68fee62c107f6a2bf85a4bb308cee64ce3a9addefa44f7';
    receipt = await solos.addDeposit(withdrawalPublicKey2, {
      from: sender1,
      value: validatorDepositAmount,
    });

    // Check solo deposit added
    await checkSoloDepositAdded({
      receipt,
      sender: sender1,
      payments,
      solos,
      withdrawalPublicKey: withdrawalPublicKey2,
      withdrawalCredentials: withdrawalCredentials2,
      addedAmount: validatorDepositAmount,
      totalAmount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));
  });
});
