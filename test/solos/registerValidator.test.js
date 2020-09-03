const { BN, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const { deployDAI } = require('../../deployments/tokens');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkSolo,
  checkValidatorRegistered,
  checkPayments,
} = require('../common/utils');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');
const Validators = artifacts.require('Validators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const validatorPrice = new BN(initialSettings.validatorPrice);
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

contract('Solos (register validator)', ([_, ...accounts]) => {
  let networkConfig, vrc, dai, validators, solos, soloId, payments;
  let [admin, operator, sender, other] = accounts;

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
      validators: validatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    solos = await Solos.at(solosProxy);
    validators = await Validators.at(validatorsProxy);

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

  it('fails to register validator for invalid solo ID', async () => {
    await expectRevert(
      solos.registerValidator(
        publicKey,
        signature,
        depositDataRoot,
        constants.ZERO_BYTES32,
        {
          from: operator,
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

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      solos.registerValidator(publicKey, signature, depositDataRoot, soloId, {
        from: other,
      }),
      'Solos: permission denied'
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

  it('fails to register validator with used public key', async () => {
    await solos.addDeposit(withdrawalPublicKey, {
      from: sender,
      value: validatorDepositAmount,
    });

    // Register validator 1
    await solos.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      soloId,
      {
        from: operator,
      }
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);

    // Register validator 2 with the same validator public key
    await expectRevert(
      solos.registerValidator(publicKey, signature, depositDataRoot, soloId, {
        from: operator,
      }),
      'Validators: public key has been already used'
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

  it('fails to register validator twice', async () => {
    // Register validator first time
    await solos.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      soloId,
      {
        from: operator,
      }
    );
    await checkSolo({
      solos,
      soloId,
      payments,
      withdrawalCredentials,
    });
    await checkCollectorBalance(solos);

    // Register validator second time
    await expectRevert(
      solos.registerValidator(publicKey, signature, depositDataRoot, soloId, {
        from: operator,
      }),
      'Solos: insufficient balance'
    );
  });

  it('registers validator', async () => {
    // register validator
    let receipt = await solos.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      soloId,
      {
        from: operator,
      }
    );

    await checkValidatorRegistered({
      vrc,
      transaction: receipt.tx,
      pubKey: publicKey,
      entityId: soloId,
      signature,
      withdrawalCredentials,
    });

    // check whether validator metering has started
    await checkPayments(payments, validatorPrice);

    await checkCollectorBalance(solos);
  });

  it("adds validator price to the user's payments contract", async () => {
    // register first validator
    await solos.registerValidator(
      publicKey,
      signature,
      depositDataRoot,
      soloId,
      {
        from: operator,
      }
    );

    // check whether first validator metering has started
    await checkPayments(payments, validatorPrice);

    // create second deposit
    await solos.addDeposit(withdrawalPublicKey, {
      from: sender,
      value: validatorDepositAmount,
    });

    // register second validator
    await solos.registerValidator(
      '0xb6c1beecd20b4d4e88032adcca1308716d0e5f560c2f61e3a266a8ba78caaeb784fefdab2aa5501eda05682c292f3a45',
      '0x8212c1edbb9e8d11d5ca4918f2579332123969c741a1e6dfa0ecb1e54229814a17bcdb8f803a651307ab11e653a7b6f6149cc2b393019b917c43c4871ea5fa28a656dba93a349056295e48f4f9ef5c10b04c651377dd8694a24cc311ef3e9080',
      '0x58bd7f3259b86bebcc8d49732981cb9933174946cd5d417691c3d8de787aba85',
      soloId,
      {
        from: operator,
      }
    );

    // check whether second validator metering has started
    await checkPayments(payments, validatorPrice.mul(new BN(2)));
  });
});
