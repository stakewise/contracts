const { expectRevert, ether, BN } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../deployments/common');
const { deployVRC } = require('../deployments/vrc');
const { getEntityId, removeNetworkFile } = require('./common/utils');

const Deposits = artifacts.require('Deposits');
const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');

contract('Deposits', ([_, admin, operator, anyone]) => {
  let networkConfig, deposits, pools;
  let users = [admin, operator, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    let {
      pools: poolsProxy,
      deposits: depositsProxy,
      operators: operatorsProxy,
    } = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    deposits = await Deposits.at(depositsProxy);
    pools = await Pools.at(poolsProxy);
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  it('only collectors can add deposits', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        deposits.addDeposit(
          getEntityId(pools.address, new BN(1)),
          users[i],
          users[i],
          ether('3'),
          {
            from: users[i],
          }
        ),
        'Permission denied.'
      );
    }
  });

  it('only collectors can cancel deposits', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        deposits.cancelDeposit(
          getEntityId(pools.address, new BN(1)),
          users[i],
          users[i],
          ether('3'),
          {
            from: users[i],
          }
        ),
        'Permission denied.'
      );
    }
  });
});
