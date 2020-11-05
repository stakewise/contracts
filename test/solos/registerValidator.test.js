const { BN, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const { deployAndInitializeVRC, vrcAbi } = require('../../deployments/vrc');
const {
  checkCollectorBalance,
  checkSolo,
  checkValidatorRegistered,
} = require('../utils');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalCredentials =
  '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061';
const signature =
  '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b';
const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';
const depositDataRoot =
  '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f';

contract('Solos (register validator)', ([_, ...accounts]) => {
  let vrc, solos, soloId;
  let [admin, operator, sender, other] = accounts;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, await deployAndInitializeVRC());
  });

  beforeEach(async () => {
    let {
      solos: solosContractAddress,
      operators: operatorsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
      vrcContractAddress: vrc.options.address,
    });
    solos = await Solos.at(solosContractAddress);

    let operators = await Operators.at(operatorsContractAddress);
    await operators.addOperator(operator, { from: admin });

    // create new solo
    await solos.addDeposit(withdrawalCredentials, {
      from: sender,
      value: validatorDepositAmount,
    });
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
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    await solos.addDeposit(withdrawalCredentials, {
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

    await checkCollectorBalance(solos);
  });
});
