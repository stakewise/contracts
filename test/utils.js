const fs = require('fs');
const { expectEvent } = require('openzeppelin-test-helpers');
const { expect } = require('chai');
const { BN, ether, balance } = require('openzeppelin-test-helpers');
const { initialSettings } = require('../deployments/settings');
const { getVRC } = require('../deployments/vrc');

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

function getEntityId(entityPrefix, entityCounter) {
  return web3.utils.soliditySha3(entityPrefix, entityCounter);
}

function getUserId(entityId, sender, withdrawer) {
  return web3.utils.soliditySha3(entityId, sender, withdrawer);
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

async function checkValidatorRegistered({
  transaction,
  pubKey,
  entityId,
  signature,
  validatorsRegistry,
  maintainerFee = new BN(initialSettings.maintainerFee),
  withdrawalCredentials = initialSettings.withdrawalCredentials,
  validatorDepositAmount = new BN(initialSettings.validatorDepositAmount)
}) {
  // Check VRC record created
  let vrc = await getVRC();
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

  // Check ValidatorsRegistry log emitted
  await expectEvent.inTransaction(
    transaction,
    ValidatorsRegistry,
    'ValidatorRegistered',
    {
      pubKey: pubKey,
      entityId: entityId,
      withdrawalCredentials,
      depositAmount: validatorDepositAmount,
      maintainerFee
    }
  );

  // Check validator entry created
  let validator = await validatorsRegistry.validators(
    web3.utils.soliditySha3(pubKey)
  );
  expect(validator.depositAmount).to.be.bignumber.equal(validatorDepositAmount);
  expect(validator.maintainerFee).to.be.bignumber.equal(maintainerFee);
  expect(validator.entityId).to.be.equal(entityId);
}

module.exports = {
  checkCollectorBalance,
  checkValidatorRegistered,
  removeNetworkFile,
  getDepositAmount,
  getUserId,
  getEntityId
};
