const { white, green } = require('chalk');
const { deployAndInitializeVRC } = require('../deployments/vrc');

async function main() {
  let vrcAddress = await deployAndInitializeVRC();
  console.log(white(`Deployed VRC contract: ${green(vrcAddress)}`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
