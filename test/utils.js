const fs = require('fs');
const { expectEvent } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { BN, ether, balance } = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../deployments/settings');
const { validatorRegistrationArgs } = require('./validatorRegistrationArgs');

const Pools = artifacts.require('Pools');
const Privates = artifacts.require('Privates');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

function getDepositAmount({
  min = new BN(initialSettings.userDepositMinUnit),
  max = ether('320')
} = {}) {
  let randomDeposit = ether(Math.random().toFixed(8))
    .mul(max.sub(min))
    .div(ether('1'))
    .add(min);

  return randomDeposit.sub(
    randomDeposit.mod(new BN(initialSettings.userDepositMinUnit))
  );
}

function getCollectorEntityId(collectorAddress, entityId) {
  return web3.utils.soliditySha3(collectorAddress, entityId);
}

function getUserId(collectorAddress, entityId, sender, withdrawer) {
  return web3.utils.soliditySha3(
    getCollectorEntityId(collectorAddress, entityId),
    sender,
    withdrawer
  );
}

function removeNetworkFile(network) {
  if (fs.existsSync(`.openzeppelin/${network}.json`)) {
    fs.unlinkSync(`.openzeppelin/${network}.json`);
  }
}

async function checkCollectorBalance(collectorContract, correctBalance) {
  expect(await collectorContract.totalSupply()).to.be.bignumber.equal(
    correctBalance
  );
  expect(
    await balance.current(collectorContract.address)
  ).to.be.bignumber.equal(correctBalance);
}

async function checkUserTotalAmount({
  depositsContract,
  collectorAddress,
  entityId,
  senderAddress,
  withdrawerAddress,
  expectedAmount
}) {
  expect(
    await depositsContract.amounts(
      getUserId(collectorAddress, entityId, senderAddress, withdrawerAddress)
    )
  ).to.be.bignumber.equal(expectedAmount);
}

async function checkDepositAdded({
  transaction,
  depositsContract,
  collectorAddress,
  entityId,
  senderAddress,
  withdrawerAddress,
  addedAmount,
  totalAmount
}) {
  // Check event log
  await expectEvent.inTransaction(
    transaction,
    depositsContract,
    'DepositAdded',
    {
      collector: collectorAddress,
      entityId,
      sender: senderAddress,
      withdrawer: withdrawerAddress,
      amount: addedAmount
    }
  );

  // Check user's total amount
  await checkUserTotalAmount({
    depositsContract,
    collectorAddress,
    entityId,
    senderAddress,
    withdrawerAddress,
    expectedAmount: totalAmount
  });
}

async function checkDepositCanceled({
  transaction,
  depositsContract,
  collectorAddress,
  entityId,
  senderAddress,
  withdrawerAddress,
  canceledAmount,
  totalAmount
}) {
  // Check event log
  await expectEvent.inTransaction(
    transaction,
    depositsContract,
    'DepositCanceled',
    {
      collector: collectorAddress,
      entityId,
      sender: senderAddress,
      withdrawer: withdrawerAddress,
      amount: canceledAmount
    }
  );

  // Check user's total amount
  await checkUserTotalAmount({
    depositsContract,
    collectorAddress,
    entityId,
    senderAddress,
    withdrawerAddress,
    expectedAmount: totalAmount
  });
}

async function checkValidatorRegistered({
  vrc,
  transaction,
  pubKey,
  entityId,
  signature,
  collectorAddress,
  validatorsRegistry,
  stakingDuration,
  maintainerFee = new BN(initialSettings.maintainerFee),
  minStakingDuration = new BN(initialSettings.minStakingDuration),
  withdrawalCredentials = initialSettings.withdrawalCredentials,
  validatorDepositAmount = new BN(initialSettings.validatorDepositAmount)
}) {
  // Check VRC record created
  await expectEvent.inTransaction(transaction, vrc, 'DepositEvent', {
    pubkey: pubKey,
    withdrawal_credentials: withdrawalCredentials,
    amount: web3.utils.bytesToHex(
      new BN(web3.utils.fromWei(validatorDepositAmount, 'gwei')).toArray(
        'le',
        8
      )
    ),
    signature: signature
  });

  let collectorEntityId = await getCollectorEntityId(
    collectorAddress,
    entityId
  );
  // Check ValidatorsRegistry log emitted
  await expectEvent.inTransaction(
    transaction,
    ValidatorsRegistry,
    'ValidatorRegistered',
    {
      pubKey: pubKey,
      collectorEntityId,
      withdrawalCredentials,
      stakingDuration,
      depositAmount: validatorDepositAmount,
      maintainerFee,
      minStakingDuration
    }
  );

  // Check validator entry created
  let validator = await validatorsRegistry.validators(
    web3.utils.soliditySha3(pubKey)
  );
  expect(validator.depositAmount).to.be.bignumber.equal(validatorDepositAmount);
  expect(validator.maintainerFee).to.be.bignumber.equal(maintainerFee);
  expect(validator.collectorEntityId).equal(collectorEntityId);
}

async function createValidator({
  args = validatorRegistrationArgs[0],
  hasReadyEntity = false,
  poolsProxy,
  privatesProxy,
  operator,
  sender,
  withdrawer
}) {
  let collector;
  if (privatesProxy) {
    collector = await Privates.at(privatesProxy);
  } else if (poolsProxy) {
    collector = await Pools.at(poolsProxy);
  }

  if (!hasReadyEntity) {
    // Create new ready pool
    await collector.addDeposit(withdrawer, {
      from: sender,
      value: initialSettings.validatorDepositAmount
    });
  }

  // Register validator for the ready entity
  await collector.registerValidator(
    args.pubKey,
    args.signature,
    args.hashTreeRoot,
    {
      from: operator
    }
  );

  return web3.utils.soliditySha3(args.pubKey);
}

module.exports = {
  validatorRegistrationArgs,
  createValidator,
  checkCollectorBalance,
  checkValidatorRegistered,
  removeNetworkFile,
  getDepositAmount,
  getUserId,
  getCollectorEntityId,
  checkUserTotalAmount,
  checkDepositAdded,
  checkDepositCanceled
};
