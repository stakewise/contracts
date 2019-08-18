const { initialSettings } = require('../../deployments/settings');

const Pools = artifacts.require('Pools');

// Validator Registration Contract arguments
const signature = web3.utils.fromAscii('\x33'.repeat(96));

async function createValidator({
  hasReadyPool = false,
  poolsProxy,
  operator,
  sender,
  withdrawer
}) {
  // Genrate random public key
  let pubKey = '0x'.padEnd(98, Math.round(Math.random() * 100000));
  let pools = await Pools.at(poolsProxy);

  if (!hasReadyPool) {
    // Create new ready pool
    await pools.addDeposit(withdrawer, {
      from: sender,
      value: initialSettings.validatorDepositAmount
    });
  }

  // Register validator for the ready pool
  await pools.registerValidator(pubKey, signature, {
    from: operator
  });

  return web3.utils.soliditySha3(pubKey);
}

module.exports = {
  createValidator
};
