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
const { removeNetworkFile, registerValidator } = require('../common/utils');

const Wallet = artifacts.require('Wallet');
const WalletsRegistry = artifacts.require('WalletsRegistry');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');

contract('Wallet', ([_, ...accounts]) => {
  let networkConfig, wallet;
  let [admin, operator, sender, recipient, walletsManager, anyone] = accounts;
  let users = [admin, operator, sender, recipient, walletsManager, anyone];

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

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    let validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      recipient
    });

    let walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
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
