const { expect } = require('chai');
const {
  BN,
  send,
  balance,
  ether,
  expectEvent,
  time,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployDAI } = require('../../deployments/tokens');
const { deployVRC } = require('../../deployments/vrc');
const {
  removeNetworkFile,
  registerValidator,
  validatorRegistrationArgs,
  getEntityId,
  signValidatorTransfer,
} = require('../common/utils');
const { testCases } = require('./withdrawalTestCases');

const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Settings = artifacts.require('Settings');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');
const Validators = artifacts.require('Validators');
const Solos = artifacts.require('Solos');
const Pools = artifacts.require('Pools');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const stakingDuration = new BN('31536000');

contract('Solos (transferred withdrawal)', ([_, ...accounts]) => {
  let networkConfig,
    solos,
    pools,
    settings,
    withdrawals,
    vrc,
    dai,
    validators,
    validatorTransfers;
  let [admin, operator, manager, other, sender, ...otherAccounts] = accounts;

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
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
      dai: dai.address,
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    // set staking duration
    settings = await Settings.at(proxies.settings);
    await settings.setStakingDuration(proxies.solos, stakingDuration, {
      from: admin,
    });

    validators = await Validators.at(proxies.validators);
    validatorTransfers = await ValidatorTransfers.at(
      proxies.validatorTransfers
    );
    solos = await Solos.at(proxies.solos);
    pools = await Pools.at(proxies.pools);
    withdrawals = await Withdrawals.at(proxies.withdrawals);
  });

  it('user can withdraw deposit and reward from transferred validator', async () => {
    for (const [
      testCaseN,
      { validatorReturn, maintainerFee, userDeposit, userReward },
    ] of testCases.entries()) {
      // set maintainer's fee
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      // user performs deposit equal to validator deposit amount
      await solos.addDeposit(otherAccounts[0], {
        from: sender,
        value: userDeposit,
      });

      // register validator
      let soloId = getEntityId(solos.address, new BN(testCaseN + 1));
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[testCaseN],
        entityId: soloId,
        solosProxy: solos.address,
        operator,
      });

      // add new entity for transfer
      let newPoolId = getEntityId(pools.address, new BN(testCaseN + 1));
      await pools.addDeposit(other, {
        from: other,
        value: validatorDepositAmount,
      });

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(stakingDuration));

      let prevEntityManagerSignature = await signValidatorTransfer(
        sender,
        soloId
      );

      // transfer validator to the new entity
      await pools.transferValidator(
        validatorId,
        validatorReturn.sub(validatorDepositAmount),
        newPoolId,
        prevEntityManagerSignature,
        {
          from: operator,
        }
      );

      // track user's balance
      let userBalance = await balance.tracker(otherAccounts[0]);

      // User withdraws deposit
      let receipt = await validatorTransfers.withdraw(
        soloId,
        otherAccounts[0],
        {
          from: sender,
        }
      );
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: soloId,
        sender: sender,
        recipient: otherAccounts[0],
        depositAmount: userDeposit,
        rewardAmount: new BN(0),
      });

      // user's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(userDeposit);

      // ValidatorTransfers is empty
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(new BN(0));

      // assign wallet
      const { logs } = await validators.assignWallet(validatorId, {
        from: manager,
      });
      let wallet = logs[0].args.wallet;

      // unlock wallet
      await send.ether(other, wallet, validatorReturn.add(ether('1')));
      await withdrawals.unlockWallet(validatorId, {
        from: manager,
      });

      // user withdraws reward
      receipt = await validatorTransfers.withdraw(soloId, otherAccounts[0], {
        from: sender,
      });
      expectEvent(receipt, 'UserWithdrawn', {
        entityId: soloId,
        sender: sender,
        recipient: otherAccounts[0],
        depositAmount: new BN(0),
        rewardAmount: userReward,
      });

      // user's balance has changed
      expect(await userBalance.delta()).to.be.bignumber.equal(userReward);

      // ValidatorTransfers is empty
      expect(
        await balance.current(validatorTransfers.address)
      ).to.be.bignumber.equal(new BN(0));
    }
  });
});
