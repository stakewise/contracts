const {
  expectRevert,
  ether,
  expectEvent
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile } = require('../utils');
const { createValidator } = require('./common');

const Wallet = artifacts.require('Wallet');
const WalletsManager = artifacts.require('WalletsManager');
const Operators = artifacts.require('Operators');

contract('Wallet', ([_, admin, operator, sender, withdrawer, anyone]) => {
  let networkConfig;
  let wallet;
  let users = [admin, operator, sender, withdrawer, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });
    let validatorId = await createValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      withdrawer
    });

    let walletsManager = await WalletsManager.at(proxies.walletsManager);
    const { logs } = await walletsManager.assignWallet(validatorId, {
      from: admin
    });
    wallet = await Wallet.at(logs[0].args.wallet);
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  it('users cannot withdraw from wallet directly', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        wallet.withdraw(users[i], ether('1'), {
          from: users[i]
        }),
        'Permission denied.'
      );
    }
  });

  it('emits event when ether transferred', async () => {
    let amount = ether('5');
    const receipt = await wallet.send(amount, { from: anyone });
    expectEvent(receipt, 'EtherAdded', {
      amount,
      sender: anyone
    });
  });
});
