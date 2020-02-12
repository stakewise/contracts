const {
  BN,
  expectRevert,
  expectEvent,
  ether,
  send
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  getCollectorEntityId,
  registerValidator
} = require('../common/utils');

const Privates = artifacts.require('Privates');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const currentReward = ether('0.034871228');
const userReward = ether('0.0278969824');
const maintainerFee = new BN('2000');

contract('ValidatorTransfers', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    withdrawals,
    privates,
    settings,
    validatorTransfers,
    walletsRegistry,
    validatorId,
    collectorEntityId;
  let [admin, operator, walletsManager, sender, withdrawer, other] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    privates = await Privates.at(proxies.privates);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set maintainer's fee
    settings = await Settings.at(proxies.settings);
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    // register new validator
    validatorId = await registerValidator({
      privatesProxy: proxies.privates,
      operator,
      sender,
      withdrawer
    });
    collectorEntityId = getCollectorEntityId(privates.address, new BN(1));
  });

  it('only Collector contracts can register transfers', async () => {
    await expectRevert(
      validatorTransfers.registerTransfer(
        validatorId,
        collectorEntityId,
        userReward,
        new BN(0),
        {
          from: admin
        }
      ),
      'Permission denied.'
    );
  });

  describe('Pausing transfers', () => {
    it('fails to pause transfers with sender other than admin', async () => {
      await expectRevert(
        validatorTransfers.setPaused(true, {
          from: operator
        }),
        'Permission denied.'
      );
    });

    it('admin user can pause transfers', async () => {
      const receipt = await validatorTransfers.setPaused(true, {
        from: admin
      });

      expectEvent(receipt, 'TransfersPaused', {
        isPaused: true,
        issuer: admin
      });
    });
  });

  describe('Withdrawals', () => {
    it('user cannot withdraw from unknown collector entity', async () => {
      await expectRevert(
        validatorTransfers.withdraw(
          getCollectorEntityId(privates.address, new BN(5)),
          withdrawer,
          {
            from: sender
          }
        ),
        'Collector entity is not registered.'
      );
    });

    it('user not holding share cannot withdraw', async () => {
      // register new private entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await privates.transferValidator(validatorId, currentReward, {
        from: operator
      });

      await expectRevert(
        validatorTransfers.withdraw(collectorEntityId, other, {
          from: other
        }),
        'User does not have a share in this collector entity.'
      );
    });

    it('user cannot withdraw deposit amount multiple times', async () => {
      // register new private entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await privates.transferValidator(validatorId, currentReward, {
        from: operator
      });

      await validatorTransfers.withdraw(collectorEntityId, withdrawer, {
        from: sender
      });

      await expectRevert(
        validatorTransfers.withdraw(collectorEntityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards multiple times', async () => {
      // register new private entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await privates.transferValidator(validatorId, currentReward, {
        from: operator
      });

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(
        collectorEntityId,
        withdrawer,
        {
          from: sender
        }
      );
      expectEvent(receipt, 'UserWithdrawn', {
        validatorId,
        sender,
        withdrawer,
        deposit: validatorDepositAmount,
        reward: new BN(0)
      });

      // assign wallet
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = logs[0].args.wallet;

      // enable withdrawals
      await send.ether(other, wallet, validatorDepositAmount);
      await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });

      // user performs rewards withdrawal first time
      receipt = await validatorTransfers.withdraw(
        collectorEntityId,
        withdrawer,
        {
          from: sender
        }
      );
      expectEvent(receipt, 'UserWithdrawn', {
        validatorId,
        sender,
        withdrawer,
        deposit: new BN(0),
        reward: userReward
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(collectorEntityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw both deposit and rewards multiple times', async () => {
      // register new private entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await privates.transferValidator(validatorId, currentReward, {
        from: operator
      });

      // assign wallet
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = logs[0].args.wallet;

      // enable withdrawals
      await send.ether(other, wallet, validatorDepositAmount);
      await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });

      // user performs deposit + rewards withdrawal first time
      let receipt = await validatorTransfers.withdraw(
        collectorEntityId,
        withdrawer,
        {
          from: sender
        }
      );
      expectEvent(receipt, 'UserWithdrawn', {
        validatorId,
        sender,
        withdrawer,
        deposit: validatorDepositAmount,
        reward: userReward
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(collectorEntityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards when validator debt is unresolved', async () => {
      // register new private entity
      await privates.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await privates.transferValidator(validatorId, currentReward, {
        from: operator
      });

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(
        collectorEntityId,
        withdrawer,
        {
          from: sender
        }
      );
      expectEvent(receipt, 'UserWithdrawn', {
        validatorId,
        sender,
        withdrawer,
        deposit: validatorDepositAmount,
        reward: new BN(0)
      });

      // debt was not resolved yet
      await expectRevert(
        validatorTransfers.withdraw(collectorEntityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });
  });
});
