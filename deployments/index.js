const { contracts } = require('./settings');

async function deployContracts() {}

async function upgradeContracts() {
  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
