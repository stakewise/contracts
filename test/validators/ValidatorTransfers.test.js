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
  getEntityId,
  registerValidator
} = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const validatorReward = ether('0.034871228');
const userReward = ether('0.0278969824');
const maintainerFee = new BN('2000');

contract('ValidatorTransfers', ([_, ...accounts]) => {
  let networkConfig,
    vrc,
    withdrawals,
    pools,
    settings,
    validatorTransfers,
    walletsRegistry,
    validatorId,
    entityId;
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
    pools = await Pools.at(proxies.pools);
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
      poolsProxy: proxies.pools,
      operator,
      sender,
      withdrawer
    });
    entityId = getEntityId(pools.address, new BN(1));
  });

  it('only Pools collector can register transfers', async () => {
    await expectRevert(
      validatorTransfers.registerTransfer(
        validatorId,
        entityId,
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
          getEntityId(pools.address, new BN(5)),
          withdrawer,
          {
            from: sender
          }
        ),
        'An entity with such ID is not registered.'
      );
    });

    it('user not holding share cannot withdraw', async () => {
      // register new pool entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(validatorId, validatorReward, {
        from: operator
      });

      await expectRevert(
        validatorTransfers.withdraw(entityId, other, {
          from: other
        }),
        'User does not have a share in this entity.'
      );
    });

    it('user cannot withdraw deposit amount multiple times', async () => {
      // register new private entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(validatorId, validatorReward, {
        from: operator
      });

      await validatorTransfers.withdraw(entityId, withdrawer, {
        from: sender
      });

      await expectRevert(
        validatorTransfers.withdraw(entityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards multiple times', async () => {
      // register new private entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(validatorId, validatorReward, {
        from: operator
      });

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(entityId, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId,
        sender,
        withdrawer,
        depositAmount: validatorDepositAmount,
        rewardAmount: new BN(0)
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
      receipt = await validatorTransfers.withdraw(entityId, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId,
        sender,
        withdrawer,
        depositAmount: new BN(0),
        rewardAmount: userReward
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(entityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw both deposit and rewards multiple times', async () => {
      // register new private entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(validatorId, validatorReward, {
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
      let receipt = await validatorTransfers.withdraw(entityId, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId,
        sender,
        withdrawer,
        depositAmount: validatorDepositAmount,
        rewardAmount: userReward
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(entityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards when validator debt is unresolved', async () => {
      // register new private entity
      await pools.addDeposit(withdrawer, {
        from: sender,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(validatorId, validatorReward, {
        from: operator
      });

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(entityId, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId,
        sender,
        withdrawer,
        depositAmount: validatorDepositAmount,
        rewardAmount: new BN(0)
      });

      // debt was not resolved yet
      await expectRevert(
        validatorTransfers.withdraw(entityId, withdrawer, {
          from: sender
        }),
        'Nothing to withdraw.'
      );
    });
  });
});
