const { expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { validatorRegistrationArgs } = require('../common/validatorRegistrationArgs');
const { removeNetworkFile } = require('../common/utils');

const Operators = artifacts.require('Operators');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');

contract('ValidatorsRegistry', ([_, ...accounts]) => {
  let networkConfig;
  let validatorsRegistry;
  let [admin, transfersManager, operator, anyone] = accounts;
  let users = [admin, transfersManager, operator, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    let {
      validatorsRegistry: validatorsRegistryProxy,
      operators: operatorsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
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

  it('only collectors can update validators', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        validatorsRegistry.update(
          web3.utils.soliditySha3(validatorRegistrationArgs[0].pubKey),
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
