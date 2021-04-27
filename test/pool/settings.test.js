const { expect } = require('chai');
const {
  send,
  ether,
  expectRevert,
  expectEvent,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setActivatedValidators,
  getOracleAccounts,
} = require('../utils');
const { validatorParams } = require('./validatorParams');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const Validators = artifacts.require('Validators');
const RewardEthToken = artifacts.require('RewardEthToken');

const withdrawalCredentials =
  '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';

contract('Pool (settings)', ([operator, anyone]) => {
  const admin = contractSettings.admin;
  let pool, oracles, oracleAccounts, rewardEthToken;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));
    await upgradeContracts();
    pool = await Pool.at(contracts.pool);

    let validators = await Validators.at(contracts.validators);
    await validators.addOperator(operator, { from: admin });

    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
  });

  afterEach(async () => resetFork());

  describe('min activating deposit', () => {
    it('not admin fails to set min activating deposit', async () => {
      await expectRevert(
        pool.setMinActivatingDeposit(ether('10'), {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set min activating deposit', async () => {
      let minActivatingDeposit = ether('10');
      let receipt = await pool.setMinActivatingDeposit(minActivatingDeposit, {
        from: admin,
      });
      await expectEvent(receipt, 'MinActivatingDepositUpdated', {
        minActivatingDeposit,
        sender: admin,
      });
      expect(await pool.minActivatingDeposit()).to.bignumber.equal(
        minActivatingDeposit
      );
    });
  });

  describe('pending validators limit', () => {
    it('not admin fails to set pending validators limit', async () => {
      await expectRevert(
        pool.setPendingValidatorsLimit('1000', {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set pending validators limit', async () => {
      let pendingValidatorsLimit = '1000';
      let receipt = await pool.setPendingValidatorsLimit(
        pendingValidatorsLimit,
        {
          from: admin,
        }
      );
      await expectEvent(receipt, 'PendingValidatorsLimitUpdated', {
        pendingValidatorsLimit,
        sender: admin,
      });
      expect(await pool.pendingValidatorsLimit()).to.bignumber.equal(
        pendingValidatorsLimit
      );
    });

    it('fails to set invalid pending validators limit', async () => {
      await expectRevert(
        pool.setPendingValidatorsLimit(10000, {
          from: admin,
        }),
        'Pool: invalid limit'
      );
    });
  });

  describe('activated validators', () => {
    it('not oracles contract or admin fails to set activated validators', async () => {
      await expectRevert(
        pool.setActivatedValidators('10', {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('admin can override activated validators', async () => {
      let activatedValidators = new BN(
        contractSettings.activatedValidators
      ).add(new BN(contractSettings.pendingValidators));
      let receipt = await pool.setActivatedValidators(activatedValidators, {
        from: admin,
      });
      expectEvent(receipt, 'ActivatedValidatorsUpdated', {
        activatedValidators,
      });
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
    });

    it('oracles contract can set activated validators', async () => {
      await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });
      await pool.addDeposit({
        from: anyone,
        value: ether('32'),
      });
      await pool.registerValidator(validatorParams[0], {
        from: operator,
      });

      let activatedValidators = new BN(contractSettings.activatedValidators)
        .add(new BN(contractSettings.pendingValidators))
        .add(new BN(1));
      let receipt = await setActivatedValidators({
        pool,
        rewardEthToken,
        activatedValidators,
        oracleAccounts,
        oracles,
      });
      await expectEvent.inTransaction(
        receipt.tx,
        Pool,
        'ActivatedValidatorsUpdated',
        {
          activatedValidators,
          sender: contracts.oracles,
        }
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
    });
  });

  describe('withdrawal credentials', () => {
    const withdrawalCredentials =
      '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';

    it('not admin fails to update withdrawal credentials', async () => {
      await expectRevert(
        pool.setWithdrawalCredentials(withdrawalCredentials, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update withdrawal credentials', async () => {
      let receipt = await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });

      await expectEvent(receipt, 'WithdrawalCredentialsUpdated', {
        withdrawalCredentials,
      });
      expect(await pool.withdrawalCredentials()).to.equal(
        withdrawalCredentials
      );
    });
  });
});
