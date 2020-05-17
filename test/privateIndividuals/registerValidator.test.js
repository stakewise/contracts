const { BN, expectRevert, constants } = require('@openzeppelin/test-helpers');
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
  checkValidatorDepositData,
  checkValidatorRegistered,
  getEntityId,
  signMessage,
} = require('../common/utils');

const PrivateIndividuals = artifacts.require('PrivateIndividuals');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const depositData = {
  amount: validatorDepositAmount,
  withdrawalCredentials:
    '0x00fd1759df8cf0dfa07a7d0b9083c7527af46d8b87c33305cee15165c49d5061',
  signature:
    '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b',
  publicKey:
    '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7',
  depositDataRoot:
    '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f',
};
const stakingDuration = new BN(86400);

contract('Private Individuals (register validator)', ([_, ...accounts]) => {
  let networkConfig, vrc, validatorsRegistry, individuals, individualId;
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
      privateIndividuals: privateIndividualsProxy,
      operators: operatorsProxy,
      validatorsRegistry: validatorsRegistryProxy,
      settings: settingsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    individuals = await PrivateIndividuals.at(privateIndividualsProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(individuals.address, stakingDuration, {
      from: admin,
    });

    // create new individual
    await individuals.addDeposit(withdrawalPublicKey, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
    individualId = getEntityId(individuals.address, new BN(1));

    // approve deposit data
    let messageHash = web3.utils.soliditySha3(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId
    );
    let operatorSignature = await signMessage(operator, messageHash);
    await individuals.approveDepositData(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId,
      operatorSignature,
      recipient,
      {
        from: sender,
      }
    );
  });

  it('fails to register validator for invalid individual ID', async () => {
    await expectRevert(
      individuals.registerValidator(constants.ZERO_BYTES32, {
        from: operator,
      }),
      'Deposit data is not approved.'
    );
    await checkValidatorDepositData(individuals, individualId, depositData);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      individuals.registerValidator(individualId, {
        from: other,
      }),
      'Permission denied.'
    );
    await checkValidatorDepositData(individuals, individualId, depositData);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('fails to register validator for the same individual twice', async () => {
    // Register validator first time
    await individuals.registerValidator(individualId, {
      from: operator,
    });
    await checkValidatorDepositData(individuals, individualId, {
      ...depositData,
      submitted: true,
    });
    await checkCollectorBalance(individuals);

    // Register validator second time
    await expectRevert(
      individuals.registerValidator(individualId, {
        from: operator,
      }),
      'Validator already registered.'
    );
    await checkValidatorDepositData(individuals, individualId, {
      ...depositData,
      submitted: true,
    });
    await checkCollectorBalance(individuals);
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await individuals.registerValidator(individualId, {
      from: operator,
    });
    await checkValidatorDepositData(individuals, individualId, {
      ...depositData,
      submitted: true,
    });
    await checkCollectorBalance(individuals);

    // Register validator 2 with the same validator public key
    await individuals.addDeposit(withdrawalPublicKey, recipient, {
      from: sender,
      value: validatorDepositAmount,
    });
    individualId = getEntityId(individuals.address, new BN(2));

    // approve deposit data
    let messageHash = web3.utils.soliditySha3(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId
    );
    let operatorSignature = await signMessage(operator, messageHash);
    await individuals.approveDepositData(
      depositData.publicKey,
      depositData.signature,
      depositData.depositDataRoot,
      individualId,
      operatorSignature,
      recipient,
      {
        from: sender,
      }
    );

    await expectRevert(
      individuals.registerValidator(individualId, {
        from: operator,
      }),
      'Public key has been already used.'
    );
    await checkValidatorDepositData(individuals, individualId, depositData);
    await checkCollectorBalance(individuals, validatorDepositAmount);
  });

  it('registers validators for individuals', async () => {
    let receipt = await individuals.registerValidator(individualId, {
      from: operator,
    });
    await checkValidatorRegistered({
      vrc,
      stakingDuration,
      transaction: receipt.tx,
      entityId: individualId,
      pubKey: depositData.publicKey,
      collectorAddress: individuals.address,
      validatorsRegistry: validatorsRegistry,
      signature: depositData.signature,
      withdrawalCredentials: depositData.withdrawalCredentials,
      maintainerFee: new BN(0),
    });
    await checkValidatorDepositData(individuals, individualId, {
      ...depositData,
      submitted: true,
    });
    await checkCollectorBalance(individuals);
  });
});
