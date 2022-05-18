const { contracts } = require('./settings');

async function deployContracts() {
  return contracts;
}

async function upgradeContracts() {
  return contracts;
}

module.exports = {
  deployContracts,
  upgradeContracts,
};
