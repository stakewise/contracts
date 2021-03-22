const { prepareContractsUpgrades } = require('../deployments');

prepareContractsUpgrades()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
