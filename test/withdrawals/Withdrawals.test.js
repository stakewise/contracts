const { send, expectRevert, constants } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, registerValidator } = require('../common/utils');

const Validators = artifacts.require('Validators');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');

contract('Withdrawals', ([_, ...accounts]) => {
  let networkConfig,
    proxies,
    validators,
    wallet,
    withdrawals,
    validatorId,
    vrc,
    dai;
  let [admin, operator, manager, other, ...otherAccounts] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
    dai = await deployDAI(admin, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validators = await Validators.at(proxies.validators);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      recipient: other,
    });
    const { logs } = await validators.assignWallet(validatorId, {
      from: manager,
    });
    wallet = logs[0].args.wallet;
  });

  it('user cannot withdraw from unknown validator', async () => {
    await expectRevert(
      withdrawals.withdraw(constants.ZERO_BYTES32, other, {
        from: other,
      }),
      'Wallet is not unlocked yet.'
    );
  });

  it('user cannot withdraw from locked wallet', async () => {
    await expectRevert(
      withdrawals.withdraw(validatorId, other, {
        from: other,
      }),
      'Wallet is not unlocked yet.'
    );
  });

  it('user not holding share cannot withdraw from wallet', async () => {
    // unlock wallet
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    await expectRevert(
      withdrawals.withdraw(validatorId, other, {
        from: otherAccounts[0],
      }),
      'User does not have a share in validator.'
    );
  });

  it('user cannot withdraw from the same wallet multiple times', async () => {
    // unlock wallet
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.unlockWallet(validatorId, {
      from: manager,
    });

    // user performs withdrawal first time
    await withdrawals.withdraw(validatorId, other, {
      from: other,
    });

    // user performs withdrawal second time
    await expectRevert(
      withdrawals.withdraw(validatorId, other, {
        from: other,
      }),
      'The withdrawal has already been performed.'
    );
  });
});
