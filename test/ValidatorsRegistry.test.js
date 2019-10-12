const { expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { deployVRC } = require('../deployments/vrc');
const { removeNetworkFile } = require('./utils');

const Operators = artifacts.require('Operators');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

contract('ValidatorsRegistry', ([_, admin, operator, anyone]) => {
  let networkConfig;
  let validatorsRegistry;
  let users = [admin, operator, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    let {
      validatorsRegistry: validatorsRegistryProxy,
      operators: operatorsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    validatorsRegistry = await ValidatorsRegistry.at(validatorsRegistryProxy);
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  it('only collectors can register validators', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        validatorsRegistry.register(
          web3.utils.fromAscii('\x11'.repeat(48)),
          web3.utils.soliditySha3('collector', 1),
          {
            from: users[i]
          }
        ),
        'Permission denied.'
      );
    }
  });
});
