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

  it('user can withdraw deposit and reward from transferred validator', async () => {
    // add entity for last test case transfer
    await pools.addDeposit(other, {
      from: other,
      value: validatorDepositAmount
    });

    // populate new entities
    for (const { users } of testCases) {
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit
        });
      }
    }

    // use last test case entity validator for transfers
    // since the queue is processed from the end
    // set maintainer's fee
    await settings.setMaintainerFee(
      testCases[testCases.length - 1].maintainerFee,
      {
        from: admin
      }
    );
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[0],
      hasReadyEntity: true,
      poolsProxy: pools.address,
      operator
    });

    // transfer validator from one test case entity to another
    for (let testCaseN = testCases.length - 1; testCaseN >= 0; testCaseN--) {
      if (testCaseN > 0) {
        // set next entity maintainer's fee
        await settings.setMaintainerFee(
          testCases[testCaseN - 1].maintainerFee,
          {
            from: admin
          }
        );
      }

      // transfer validator
      let validatorReturn = testCases[testCaseN].validatorReturn;
      await pools.transferValidator(
        validatorId,
        validatorReturn.sub(validatorDepositAmount),
        {
          from: operator
        }
      );

      // ValidatorTransfers contract receives validator deposit amounts
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(
        new BN(testCases.length - testCaseN).mul(validatorDepositAmount)
      );
    }

    // users withdraw their deposits
    let validatorTransfersBalance = validatorDepositAmount.mul(
      new BN(testCases.length)
    );
    for (const [testCaseN, { users }] of testCases.entries()) {
      let entityId = getEntityId(
        pools.address,
        // +2 because there is one extra entity which holds current validator
        new BN(testCaseN + 2)
      );

      // users withdraw their deposits
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
          withdrawer: otherAccounts[j],
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
    // All deposits have been withdrawn
    expect(
      await balance.current(validatorTransfers.address)
    ).to.be.bignumber.equal(new BN(0));

    // calculate validator return
    let totalValidatorDebts = new BN(0);
    for (const { validatorReturn, maintainerReward } of testCases) {
      totalValidatorDebts.iadd(
        validatorReturn.sub(validatorDepositAmount).sub(maintainerReward)
      );
    }

    // assign wallet
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    let wallet = logs[0].args.wallet;

    // enable withdrawals
    // extra 1 eth of reward for current validator holder
    await send.ether(
      other,
      wallet,
      totalValidatorDebts.add(ether('1')).add(validatorDepositAmount)
    );
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    // users withdraw their rewards
    for (const [testCaseN, { users }] of testCases.entries()) {
      let entityId = getEntityId(
        pools.address,
        // +2 because there is one extra entity which holds current validator
        new BN(testCaseN + 2)
      );

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
          withdrawer: otherAccounts[j],
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
