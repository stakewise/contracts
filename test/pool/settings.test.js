const { expect } = require('chai');
const {
  send,
  ether,
  expectRevert,
  expectEvent,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setActivatedValidators,
  setupOracleAccounts,
  registerValidators,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings } = require('../../deployments/settings');
const {
  depositData,
  depositDataMerkleRoot,
} = require('./depositDataMerkleRoot');

const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');
const PoolValidators = artifacts.require('PoolValidators');
const RewardEthToken = artifacts.require('RewardEthToken');
const iDepositContract = artifacts.require('IDepositContract');

contract('Pool (settings)', ([operator, anyone, ...otherAccounts]) => {
  const admin = contractSettings.admin;
  let pool, oracles, oracleAccounts, validatorsDepositRoot, contracts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    contracts = await upgradeContracts();
    let validators = await PoolValidators.at(contracts.poolValidators);
    await validators.addOperator(
      operator,
      depositDataMerkleRoot,
      'ipfs://QmSTP443zR6oKnYVRE23RARyuuzwhhaidUiSXyRTsw3pDs',
      {
        from: admin,
      }
    );
    await validators.commitOperator({
      from: operator,
    });
    pool = await Pool.at(contracts.pool);
    let depositContract = await iDepositContract.at(
      await pool.validatorRegistration()
    );
    validatorsDepositRoot = await depositContract.get_deposit_root();
    oracles = await Oracles.at(contracts.oracles);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
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
      let activatedValidators = await pool.activatedValidators();
      activatedValidators = activatedValidators.add(
        await pool.pendingValidators()
      );

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
      await pool.stake({
        from: anyone,
        value: ether('32'),
      });
      await registerValidators({
        depositData: [
          {
            operator,
            withdrawalCredentials: depositData[0].withdrawalCredentials,
            depositDataRoot: depositData[0].depositDataRoot,
            publicKey: depositData[0].publicKey,
            signature: depositData[0].signature,
          },
        ],
        merkleProofs: [depositData[0].merkleProof],
        oracles,
        oracleAccounts,
        validatorsDepositRoot,
      });

      let activatedValidators = await pool.activatedValidators();
      activatedValidators = activatedValidators.add(
        await pool.pendingValidators()
      );

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
          sender: oracles.address,
        }
      );
      expect(await pool.activatedValidators()).to.bignumber.equal(
        activatedValidators
      );
    });
  });
});
