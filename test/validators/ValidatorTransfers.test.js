const {
  BN,
  expectRevert,
  expectEvent,
  ether,
  send,
  constants,
  time,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  getEntityId,
  registerValidator,
} = require('../common/utils');

const Pools = artifacts.require('Pools');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const Validators = artifacts.require('Validators');
const Withdrawals = artifacts.require('Withdrawals');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');
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
    validators,
    validatorId,
    prevEntityId,
    prevEntityManagerSignature;
  let [admin, operator, manager, sender, recipient, other] = accounts;

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
      vrc: vrc.options.address,
    });
    pools = await Pools.at(proxies.pools);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );
    validators = await Validators.at(proxies.validators);

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    // set maintainer's fee
    settings = await Settings.at(proxies.settings);
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    // set staking duration
    await settings.setStakingDuration(pools.address, stakingDuration, {
      from: admin,
    });

    // register new validator
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      recipient,
    });
    prevEntityId = getEntityId(pools.address, new BN(1));
    prevEntityManagerSignature = constants.ZERO_BYTES32;

    // wait until staking duration has passed
    await time.increase(time.duration.seconds(stakingDuration));
  });

  it('only collectors can register transfers', async () => {
    await expectRevert(
      validatorTransfers.registerTransfer(
        validatorId,
        prevEntityId,
        userReward,
        new BN(0),
        {
          from: admin,
        }
      ),
      'Permission denied.'
    );
  });

  it('only collectors can allow transfers', async () => {
    await expectRevert(
      validatorTransfers.allowTransfer(prevEntityId, {
        from: admin,
      }),
      'Permission denied.'
    );
  });

  it('only withdrawals contract can resolve debts', async () => {
    await expectRevert(
      validatorTransfers.resolveDebt(prevEntityId, {
        from: admin,
      }),
      'Permission denied.'
    );
  });

  describe('Withdrawals', () => {
    it('user cannot withdraw from unknown collector entity', async () => {
      await expectRevert(
        validatorTransfers.withdraw(
          getEntityId(pools.address, new BN(5)),
          recipient,
          {
            from: sender,
          }
        ),
        'An entity with such ID is not registered.'
      );
    });

    it('user not holding share cannot withdraw', async () => {
      // register new pool
      let poolId = getEntityId(pools.address, new BN(2));
      await pools.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReward,
        poolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      await expectRevert(
        validatorTransfers.withdraw(prevEntityId, other, {
          from: other,
        }),
        'User does not have a share in this entity.'
      );
    });

    it('user cannot withdraw deposit amount multiple times', async () => {
      // register new pool
      let poolId = getEntityId(pools.address, new BN(2));
      await pools.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReward,
        poolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      await validatorTransfers.withdraw(prevEntityId, recipient, {
        from: sender,
      });

      await expectRevert(
        validatorTransfers.withdraw(prevEntityId, recipient, {
          from: sender,
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards multiple times', async () => {
      // register new pool
      let poolId = getEntityId(pools.address, new BN(2));
      await pools.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReward,
        poolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(prevEntityId, recipient, {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: prevEntityId,
        sender,
        recipient,
        depositAmount: validatorDepositAmount,
        rewardAmount: new BN(0),
      });

      // assign wallet
      const { logs } = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = logs[0].args.wallet;

      // unlock wallet
      await send.ether(other, wallet, validatorDepositAmount);
      await withdrawals.unlockWallet(validatorId, {
        from: manager,
      });

      // user performs rewards withdrawal first time
      receipt = await validatorTransfers.withdraw(prevEntityId, recipient, {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: prevEntityId,
        sender,
        recipient,
        depositAmount: new BN(0),
        rewardAmount: userReward,
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(prevEntityId, recipient, {
          from: sender,
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw both deposit and rewards multiple times', async () => {
      // register new pool
      let poolId = getEntityId(pools.address, new BN(2));
      await pools.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReward,
        poolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      // assign wallet
      const { logs } = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = logs[0].args.wallet;

      // unlock wallet
      await send.ether(other, wallet, validatorDepositAmount);
      await withdrawals.unlockWallet(validatorId, {
        from: manager,
      });

      // user performs deposit + rewards withdrawal first time
      let receipt = await validatorTransfers.withdraw(prevEntityId, recipient, {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: prevEntityId,
        sender,
        recipient,
        depositAmount: validatorDepositAmount,
        rewardAmount: userReward,
      });

      // user performs withdrawal second time
      await expectRevert(
        validatorTransfers.withdraw(prevEntityId, recipient, {
          from: sender,
        }),
        'Nothing to withdraw.'
      );
    });

    it('user cannot withdraw rewards when validator debt is unresolved', async () => {
      // register new pool
      let poolId = getEntityId(pools.address, new BN(2));
      await pools.addDeposit(recipient, {
        from: sender,
        value: validatorDepositAmount,
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReward,
        poolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      // user withdraws deposit
      let receipt = await validatorTransfers.withdraw(prevEntityId, recipient, {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: prevEntityId,
        sender,
        recipient,
        depositAmount: validatorDepositAmount,
        rewardAmount: new BN(0),
      });

      // debt was not resolved yet
      await expectRevert(
        validatorTransfers.withdraw(prevEntityId, recipient, {
          from: sender,
        }),
        'Nothing to withdraw.'
      );
    });
  });
});
