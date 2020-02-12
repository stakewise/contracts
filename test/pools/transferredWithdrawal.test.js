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
  getCollectorEntityId
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
    let entityId = new BN(1);
    for (const [
      testCaseN,
      { validatorReturn, maintainerFee, users, maintainerReward }
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // populate pool with deposits
      for (let j = 0; j < users.length; j++) {
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: users[j].deposit
        });
      }

      // Register validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        hasReadyEntity: true,
        poolsProxy: pools.address,
        operator
      });

      // add new entity for transfer
      await pools.addDeposit(other, {
        from: other,
        value: validatorDepositAmount
      });

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReturn.sub(validatorDepositAmount),
        {
          from: operator
        }
      );
      let collectorEntityId = getCollectorEntityId(pools.address, entityId);
      let validatorTransfersBalance = validatorDepositAmount.clone();

      // users withdraw their deposits
      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws deposit
        let receipt = await validatorTransfers.withdraw(
          collectorEntityId,
          otherAccounts[j],
          {
            from: sender
          }
        );
        expectEvent(receipt, 'UserWithdrawn', {
          validatorId,
          sender: sender,
          withdrawer: otherAccounts[j],
          deposit: users[j].deposit,
          reward: new BN(0)
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
      // ValidatorTransfers is empty
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(new BN(0));

      // assign wallet
      const { logs } = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = logs[0].args.wallet;

      // enable withdrawals
      await send.ether(other, wallet, validatorReturn.add(ether('1')));
      await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });

      validatorTransfersBalance = validatorReturn
        .sub(maintainerReward)
        .sub(validatorDepositAmount);

      // users withdraw their rewards
      for (let j = 0; j < users.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws reward
        let receipt = await validatorTransfers.withdraw(
          collectorEntityId,
          otherAccounts[j],
          {
            from: sender
          }
        );
        expectEvent(receipt, 'UserWithdrawn', {
          validatorId,
          sender: sender,
          withdrawer: otherAccounts[j],
          deposit: new BN(0),
          reward: users[j].reward
        });

        // User's balance has changed
        expect(await userBalance.delta()).to.be.bignumber.equal(
          users[j].reward
        );

        // ValidatorTransfers balance has changed
        validatorTransfersBalance.isub(users[j].reward);
        expect(
          await balance.current(validatorTransfers.address)
        ).to.be.bignumber.equal(validatorTransfersBalance);
      }

      // ValidatorTransfers is empty
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(new BN(0));
      entityId.iadd(new BN(2));
    }
  });
});
