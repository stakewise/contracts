const { expect } = require('chai');
const {
  BN,
  expectRevert,
  constants,
  time,
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
  checkPendingSolo,
  checkValidatorRegistered,
  signValidatorTransfer,
  validatorRegistrationArgs,
  getEntityId,
} = require('../common/utils');

const Solos = artifacts.require('Solos');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const Validators = artifacts.require('Validators');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const Managers = artifacts.require('Managers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
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
const stakingDuration = new BN(86400);

contract('Solos (register validator)', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    validators,
    validatorTransfers,
    managers,
    solos,
    soloId;
  let [admin, operator, sender, recipient, other] = accounts;

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
      solos: solosProxy,
      operators: operatorsProxy,
      validators: validatorsProxy,
      validatorTransfers: validatorTransferProxy,
      settings: settingsProxy,
      managers: managersProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    solos = await Solos.at(solosProxy);
    validators = await Validators.at(validatorsProxy);
    managers = await Managers.at(managersProxy);
    validatorTransfers = await ValidatorTransfers.at(validatorTransferProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(solos.address, stakingDuration, {
      from: admin,
    });

    // create new solo
    await solos.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = getEntityId(solos.address, new BN(1));
  });

  it('fails to register validator for invalid solo deposit', async () => {
    await expectRevert(
      solos.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        constants.ZERO_BYTES32,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingSolo({
      solos,
      soloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      solos.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        soloId,
        {
          from: other,
        }
      ),
      'Permission denied.'
    );
    await checkPendingSolo({
      solos,
      soloId,
      amount: validatorDepositAmount,
    });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await solos.registerValidator(
      validatorRegistrationArgs[0].pubKey,
      validatorRegistrationArgs[0].signature,
      validatorRegistrationArgs[0].hashTreeRoot,
      soloId,
      {
        from: operator,
      }
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);

    // Register validator 2 with the same validator public key
    await solos.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = getEntityId(solos.address, new BN(2));
    await expectRevert(
      solos.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        soloId,
        {
          from: operator,
        }
      ),
      'Public key has been already used.'
    );
    await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
    await checkCollectorBalance(solos, validatorDepositAmount);
  });

  it('fails to register validator for the same solo twice', async () => {
    // Register validator first time
    await solos.registerValidator(
      validatorRegistrationArgs[0].pubKey,
      validatorRegistrationArgs[0].signature,
      validatorRegistrationArgs[0].hashTreeRoot,
      soloId,
      {
        from: operator,
      }
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);

    // Register validator second time
    await expectRevert(
      solos.registerValidator(
        validatorRegistrationArgs[0].pubKey,
        validatorRegistrationArgs[0].signature,
        validatorRegistrationArgs[0].hashTreeRoot,
        soloId,
        {
          from: operator,
        }
      ),
      'Invalid validator deposit amount.'
    );
    await checkPendingSolo({ solos, soloId });
    await checkCollectorBalance(solos);
  });

  it('registers validators for solos', async () => {
    // one solo is already created
    let totalAmount = validatorDepositAmount;

    // create registrable solos
    let soloIds = [soloId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      await solos.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });
      soloId = getEntityId(solos.address, new BN(i + 1));
      soloIds.push(soloId);

      await checkPendingSolo({ solos, soloId, amount: validatorDepositAmount });
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(solos, totalAmount);

    // register validators
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await solos.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        soloIds[i],
        {
          from: operator,
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      await checkPendingSolo({ solos, soloId: soloIds[i] });
      await checkValidatorRegistered({
        vrc,
        stakingDuration,
        validators,
        transaction: tx,
        entityId: soloIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: solos.address,
        signature: validatorRegistrationArgs[i].signature,
      });

      // check manager permissions
      expect(
        await managers.canTransferValidator(
          soloIds[i],
          await signValidatorTransfer(sender, soloIds[i])
        )
      ).equal(true);

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(stakingDuration));
      expect(await validatorTransfers.checkTransferAllowed(soloIds[i])).equal(
        true
      );
    }
    await checkCollectorBalance(solos);
  });

  it('registers validators for private solos', async () => {
    // create private solo deposit
    await solos.addPrivateDeposit(withdrawalPublicKey, {
      from: sender,
      value: validatorDepositAmount,
    });
    soloId = getEntityId(solos.address, new BN(2));
    await checkPendingSolo({
      solos,
      soloId,
      withdrawalCredentials,
      amount: validatorDepositAmount,
    });

    // check balance increased correctly
    // multiply by 2 as there is already one solo deposit in contract
    await checkCollectorBalance(solos, validatorDepositAmount.mul(new BN(2)));

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
      stakingDuration,
      transaction: receipt.tx,
      entityId: soloId,
      pubKey: publicKey,
      collectorAddress: solos.address,
      validators,
      signature,
      withdrawalCredentials,
      maintainerFee: new BN(0),
    });

    // check manager permissions
    expect(
      await managers.canTransferValidator(
        soloId,
        await signValidatorTransfer(sender, soloId)
      )
    ).equal(true);

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));
    expect(await validatorTransfers.checkTransferAllowed(soloId)).equal(false);

    // there was already one solo deposit in contract
    await checkCollectorBalance(solos, validatorDepositAmount);
  });
});
