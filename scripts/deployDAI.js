const { white, green } = require('chalk');
const { deployAndInitializeERC20Mock } = require('../deployments/tokens');
const { initialSettings } = require('../deployments/settings');

async function main() {
  let daiTokenAddress = await deployAndInitializeERC20Mock(
    initialSettings.admin,
    'Goerli DAI',
    'goDAI'
  );
  console.log(
    white(`Deployed Goerli DAI Token contract: ${green(daiTokenAddress)}`)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
