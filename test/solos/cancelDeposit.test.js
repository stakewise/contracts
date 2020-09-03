const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  expectEvent,
  constants,
  balance,
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
  checkSolo,
} = require('../common/utils');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');

const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';
const signature =
  '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b';
const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';
const depositDataRoot =
  '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f';
const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Solos (cancel deposit)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, solos, soloId, payments;
  let [admin, operator, sender, anyone] = accounts;

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
      solos: solosProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    solos = await Solos.at(solosProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // create new solo
    let receipt = await solos.addDeposit(withdrawalPublicKey, {
      from: sender,
      value: validatorDepositAmount,
    });
    payments = receipt.logs[0].args.payments;
    soloId = web3.utils.soliditySha3(
      solos.address,
      sender,
      withdrawalCredentials
    );
  });

  it('fails to cancel a deposit with invalid withdrawal credentials', async () => {
    await expectRevert(
      solos.cancelDeposit(constants.ZERO_ADDRESS, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: invalid withdrawal credentials'
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit for other user account', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: anyone,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with zero amount', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, 0, {
        from: sender,
      }),
      'Solos: invalid cancel amount'
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with amount bigger than deposit', async () => {
    await expectRevert(
      solos.cancelDeposit(
        withdrawalCredentials,
        validatorDepositAmount.add(ether('1')),
        {
          from: sender,
        }
      ),
      'Solos: insufficient balance'
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with too small unit', async () => {
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, ether('1'), {
        from: sender,
      }),
      'Solos: invalid cancel amount'
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to cancel a deposit with registered validator', async () => {
    await solos.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      soloId,
      {
        from: operator,
      }
    );

    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({ solos, soloId, withdrawalCredentials, payments });
    await checkCollectorBalance(solos);
  });

  it('fails to cancel deposit amount twice', async () => {
    await solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
      from: sender,
    });
    await expectRevert(
      solos.cancelDeposit(withdrawalCredentials, validatorDepositAmount, {
        from: sender,
      }),
      'Solos: insufficient balance'
    );
    await checkSolo({ solos, soloId, withdrawalCredentials, payments });
    await checkCollectorBalance(solos);
  });

  it('cancels deposit in full amount', async () => {
    const prevBalance = await balance.current(sender);
    const receipt = await solos.cancelDeposit(
      withdrawalCredentials,
      validatorDepositAmount,
      {
        from: sender,
      }
    );
    expectEvent(receipt, 'DepositCanceled', {
      soloId,
      amount: validatorDepositAmount,
    });
    await checkSolo({ solos, soloId, withdrawalCredentials, payments });
    await checkCollectorBalance(solos);

    // Check recipient balance changed
    expect(prevBalance.lt(await balance.current(sender))).to.be.equal(true);
  });
});
