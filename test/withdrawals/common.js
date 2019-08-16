const { initialSettings } = require('../../deployments/settings');

const Pools = artifacts.require('Pools');

// Validator Registration Contract arguments
const publicKey = web3.utils.fromAscii('\x11'.repeat(48));
const signature = web3.utils.fromAscii('\x33'.repeat(96));

async function createValidator({
  pubKey = publicKey,
  poolsProxy,
  operator,
  sender,
  withdrawer
}) {
  let pools = await Pools.at(poolsProxy);
  // Create new ready pool
  await pools.addDeposit(withdrawer, {
    from: sender,
    value: initialSettings.validatorDepositAmount
  });

  // Register validator for the ready pool
  await pools.registerValidator(pubKey, signature, {
    from: operator
  });

  return web3.utils.soliditySha3(pubKey);
}

module.exports = {
  createValidator
};
