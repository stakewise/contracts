const { expect } = require('chai');
const { BN, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  checkCollectorBalance,
  checkValidatorRegistered,
  validatorRegistrationArgs,
  getEntityId
} = require('../common/utils');

const Individual = artifacts.require('Individuals');
const Operators = artifacts.require('Operators');
const Settings = artifacts.require('Settings');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const { pubKey, signature, hashTreeRoot } = validatorRegistrationArgs[0];
const stakingDuration = new BN(86400);

contract('Individuals (register validator)', ([_, ...accounts]) => {
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
      individuals: individualsProxy,
      operators: operatorsProxy,
      validatorsRegistry: validatorsRegistryProxy,
      settings: settingsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    individuals = await Individual.at(individualsProxy);
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);

    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // set staking duration
    let settings = await Settings.at(settingsProxy);
    await settings.setStakingDuration(individuals.address, stakingDuration, {
      from: admin
    });

    // create new individual
    await individuals.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount
    });
    individualId = getEntityId(individuals.address, new BN(1));
  });

  it('fails to register validator for invalid individual', async () => {
    await expectRevert(
      individuals.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        constants.ZERO_BYTES32,
        {
          from: operator
        }
      ),
      'Invalid validator deposit amount.'
    );
  });

  it('fails to register validator with callers other than operator', async () => {
    await expectRevert(
      individuals.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        individualId,
        {
          from: other
        }
      ),
      'Permission denied.'
    );
  });

  it('fails to register validator with used public key', async () => {
    // Register validator 1
    await individuals.registerValidator(
      pubKey,
      signature,
      hashTreeRoot,
      individualId,
      {
        from: operator
      }
    );

    // Register validator 2 with the same validator public key
    await individuals.addDeposit(recipient, {
      from: sender,
      value: validatorDepositAmount
    });
    individualId = getEntityId(individuals.address, new BN(2));
    await expectRevert(
      individuals.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        individualId,
        {
          from: operator
        }
      ),
      'Public key has been already used.'
    );
  });

  it('fails to register validator for the same individual twice', async () => {
    // Register validator first time
    await individuals.registerValidator(
      pubKey,
      signature,
      hashTreeRoot,
      individualId,
      {
        from: operator
      }
    );

    // Register validator second time
    await expectRevert(
      individuals.registerValidator(
        pubKey,
        signature,
        hashTreeRoot,
        individualId,
        {
          from: operator
        }
      ),
      'Invalid validator deposit amount.'
    );
  });

  it('registers validators for individuals with validator deposit amount collected', async () => {
    // one individual is already created
    let totalAmount = validatorDepositAmount;

    // create registrable individuals
    let individualIds = [individualId];
    for (let i = 1; i < validatorRegistrationArgs.length; i++) {
      await individuals.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount
      });
      individualId = getEntityId(individuals.address, new BN(i + 1));
      individualIds.push(individualId);
      totalAmount = totalAmount.add(validatorDepositAmount);
    }

    // check balance increased correctly
    await checkCollectorBalance(individuals, totalAmount);

    // register validators
    for (let i = 0; i < validatorRegistrationArgs.length; i++) {
      const { tx } = await individuals.registerValidator(
        validatorRegistrationArgs[i].pubKey,
        validatorRegistrationArgs[i].signature,
        validatorRegistrationArgs[i].hashTreeRoot,
        individualIds[i],
        {
          from: operator
        }
      );
      totalAmount = totalAmount.sub(validatorDepositAmount);

      let pendingIndividual = await individuals.pendingIndividuals(
        individualIds[i]
      );
      expect(pendingIndividual.maintainerFee).to.be.bignumber.equal(new BN(0));
      expect(pendingIndividual.depositAmount).to.be.bignumber.equal(new BN(0));

      await checkValidatorRegistered({
        vrc,
        stakingDuration,
        transaction: tx,
        entityId: individualIds[i],
        pubKey: validatorRegistrationArgs[i].pubKey,
        collectorAddress: individuals.address,
        validatorsRegistry: validatorsRegistry,
        signature: validatorRegistrationArgs[i].signature
      });
    }
    await checkCollectorBalance(individuals, new BN(0));
  });
});
