const { expect } = require('chai');
const {
  BN,
  send,
  balance,
  ether,
  expectEvent
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
  registerValidator,
  validatorRegistrationArgs,
  getEntityId
} = require('../common/utils');
const { testCases } = require('./withdrawalTestCases');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Pools = artifacts.require('Pools');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');

contract('Pools (transferred withdrawal)', ([_, ...accounts]) => {
  let networkConfig,
    pools,
    settings,
    walletsRegistry,
    withdrawals,
    vrc,
    validatorTransfers;
  let [
    admin,
    operator,
    walletsManager,
    other,
    sender,
    ...otherAccounts
  ] = accounts;

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
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(proxies.pools, stakingDuration, {
      from: admin
    });

    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );
    pools = await Pools.at(proxies.pools);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
  });

  it('user can withdraw deposit and reward from transferred validators', async () => {
    let validatorIds = [];
    // transfer pools
    for (let i = 0; i < testCases.length; i++) {
      // set maintainer's fee
      await settings.setMaintainerFee(testCases[i].maintainerFee, {
        from: admin
      });

      let { users, validatorReturn } = testCases[i];
      // add pool
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit
        });
      }
      let prevEntityId = getEntityId(pools.address, new BN(i * 2 + 1));

      // register new validator
      validatorIds.push(
        await registerValidator({
          args: validatorRegistrationArgs[i + 1],
          entityId: prevEntityId,
          poolsProxy: pools.address,
          operator
        })
      );
      let newEntityId = getEntityId(pools.address, new BN(i * 2 + 2));

      // add new pool to transfer to
      await pools.addDeposit(other, {
        from: other,
        value: validatorDepositAmount
      });

      // transfer validator
      await pools.transferValidator(
        validatorIds[i],
        validatorReturn.sub(validatorDepositAmount),
        newEntityId,
        {
          from: operator
        }
      );

      // ValidatorTransfers contract receives validator deposit amounts
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(new BN(i + 1).mul(validatorDepositAmount));
    }

    let validatorTransfersBalance = validatorDepositAmount.mul(
      new BN(testCases.length)
    );

    // users withdraw their deposits
    for (let i = 0; i < testCases.length; i++) {
      let entityId = getEntityId(pools.address, new BN(i * 2 + 1));
      let { users } = testCases[i];

      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws deposit
        let receipt = await validatorTransfers.withdraw(
          entityId,
          otherAccounts[j],
          {
            from: sender
          }
        );
        expectEvent(receipt, 'UserWithdrawn', {
          entityId,
          sender: sender,
          recipient: otherAccounts[j],
          depositAmount: users[j].deposit,
          rewardAmount: new BN(0)
        });

        // User's balance has changed
        expect(await userBalance.delta()).to.be.bignumber.equal(
          users[j].deposit
        );

        // ValidatorTransfers balance has changed
        validatorTransfersBalance.isub(users[j].deposit);
        expect(
          await balance.current(validatorTransfers.address)
        ).to.be.bignumber.equal(validatorTransfersBalance);
      }
    }

    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(new BN(0));

    // assign wallets to validators
    for (let i = 0; i < testCases.length; i++) {
      const { validatorReturn, maintainerReward } = testCases[i];

      // assign wallet
      const { logs } = await walletsRegistry.assignWallet(validatorIds[i], {
        from: walletsManager
      });
      let wallet = logs[0].args.wallet;

      // enable withdrawals
      // extra 1 eth of reward for current validator holder
      await send.ether(
        other,
        wallet,
        validatorReturn
          .add(maintainerReward)
          .add(ether('1'))
          .add(validatorDepositAmount)
      );
      await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });
    }

    // calculate total debts
    let totalValidatorDebts = new BN(0);
    for (const { validatorReturn, maintainerReward } of testCases) {
      totalValidatorDebts.iadd(
        validatorReturn.sub(validatorDepositAmount).sub(maintainerReward)
      );
    }

    // users withdraw their rewards
    for (let i = 0; i < testCases.length; i++) {
      let entityId = getEntityId(pools.address, new BN(i * 2 + 1));
      let { users } = testCases[i];

      // users withdraw their rewards
      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws reward
        let receipt = await validatorTransfers.withdraw(
          entityId,
          otherAccounts[j],
          {
            from: sender
          }
        );
        expectEvent(receipt, 'UserWithdrawn', {
          entityId,
          sender: sender,
          recipient: otherAccounts[j],
          depositAmount: new BN(0),
          rewardAmount: users[j].reward
        });

        // User's balance has changed
        expect(await userBalance.delta()).to.be.bignumber.equal(
          users[j].reward
        );

        // ValidatorTransfers balance has changed
        totalValidatorDebts.isub(users[j].reward);
        expect(
          await balance.current(validatorTransfers.address)
        ).to.be.bignumber.equal(totalValidatorDebts);
      }
    }

    // ValidatorTransfers is empty
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(new BN(0));
  });
});
