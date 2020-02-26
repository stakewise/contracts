const { send, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, registerValidator } = require('../common/utils');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');

contract('Withdrawals', ([_, ...accounts]) => {
  let networkConfig,
    proxies,
    walletsRegistry,
    wallet,
    withdrawals,
    validatorId,
    vrc;
  let [admin, operator, walletsManager, other, ...otherAccounts] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    wallet = logs[0].args.wallet;
  });

  it('user cannot withdraw from unknown wallet', async () => {
    await expectRevert(
      withdrawals.withdraw(constants.ZERO_ADDRESS, other, {
        from: other
      }),
      'Wallet withdrawals are not enabled.'
    );
  });

  it('user cannot withdraw from locked wallet', async () => {
    await expectRevert(
      withdrawals.withdraw(wallet, other, {
        from: other
      }),
      'Wallet withdrawals are not enabled.'
    );
  });

  it('user not holding share cannot withdraw from wallet', async () => {
    // enable withdrawals
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    await expectRevert(
      withdrawals.withdraw(wallet, other, {
        from: otherAccounts[0]
      }),
      'User does not have a share in this wallet.'
    );
  });

  it('user cannot withdraw from the same wallet multiple times', async () => {
    // enable withdrawals
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // user performs withdrawal first time
    await withdrawals.withdraw(wallet, other, {
      from: other
    });

    // user performs withdrawal second time
    await expectRevert(
      withdrawals.withdraw(wallet, other, {
        from: other
      }),
      'The withdrawal has already been performed.'
    );
  });
});
