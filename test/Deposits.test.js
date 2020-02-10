const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { deployVRC } = require('../deployments/vrc');
const { removeNetworkFile } = require('./utils');

const Deposits = artifacts.require('Deposits');
const Operators = artifacts.require('Operators');

contract('Deposits Contract', ([_, admin, operator, transfersManager, anyone]) => {
  let networkConfig;
  let deposits;
  let users = [admin, operator, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    let {
      deposits: depositsProxy,
      operators: operatorsProxy
    } = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    deposits = await Deposits.at(depositsProxy);
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  it('only collectors can add deposits', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        deposits.addDeposit(1, users[i], users[i], ether('3'), {
          from: users[i]
        }),
        'Permission denied.'
      );
    }
  });

  it('only collectors can cancel deposits', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        deposits.cancelDeposit(1, users[i], users[i], ether('3'), {
          from: users[i]
        }),
        'Permission denied.'
      );
    }
  });
});
