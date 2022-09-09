const { expect } = require('chai');
const {
  ether,
  balance,
  send,
  expectRevert,
  expectEvent,
  constants,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  getDepositAmount,
  registerValidators,
  setupOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { checkStakedEthToken } = require('../utils');
const {
  depositData,
  depositDataMerkleRoot,
} = require('./depositDataMerkleRoot');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');
const PoolValidators = artifacts.require('PoolValidators');
const Oracles = artifacts.require('Oracles');
const iDepositContract = artifacts.require('IDepositContract');

contract('Pool (stake)', (accounts) => {
  const admin = contractSettings.admin;
  let [sender1, sender2, sender3, operator, ...otherAccounts] = accounts;
  let pool,
    stakedEthToken,
    validators,
    oracles,
    oracleAccounts,
    totalSupply,
    poolBalance,
    activatedValidators,
    pendingValidators,
    depositContract,
    validatorsDepositRoot;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender3, admin, ether('5'));
    let upgradedContracts = await upgradeContracts();

    pool = await Pool.at(contracts.pool);
    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    validators = await PoolValidators.at(upgradedContracts.poolValidators);
    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
    depositContract = await iDepositContract.at(
      await pool.validatorRegistration()
    );
    validatorsDepositRoot = await depositContract.get_deposit_root();
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

    totalSupply = await stakedEthToken.totalSupply();
    poolBalance = await balance.current(pool.address);
    activatedValidators = await pool.activatedValidators();
    pendingValidators = await pool.pendingValidators();
  });

  afterEach(async () => resetFork());

  describe('stake', () => {
    it('fails to stake with zero amount', async () => {
      await expectRevert(
        pool.stake({ from: sender1, value: ether('0') }),
        'Pool: invalid deposit amount'
      );
    });

    it('fails to stake with zero address', async () => {
      await expectRevert(
        pool.stakeOnBehalf(constants.ZERO_ADDRESS, {
          from: sender1,
          value: ether('0'),
        }),
        'Pool: invalid recipient'
      );
    });

    it('fails to stake in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.stake({
          from: sender1,
          value: ether('1'),
        }),
        'Pausable: paused'
      );
    });

    it('mints tokens for users with deposit less than min activating', async () => {
      let maxAmount = ether('0.01');
      await pool.setMinActivatingDeposit(maxAmount, { from: admin });
      // User 1 creates a deposit
      let depositAmount1 = getDepositAmount({
        max: maxAmount,
      });
      totalSupply = totalSupply.add(depositAmount1);
      poolBalance = poolBalance.add(depositAmount1);

      await pool.stake({
        from: sender1,
        value: depositAmount1,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount1,
      });

      // User 2 creates a deposit
      maxAmount = await pool.minActivatingDeposit();
      let depositAmount2 = getDepositAmount({
        max: maxAmount,
      });
      totalSupply = totalSupply.add(depositAmount2);
      poolBalance = poolBalance.add(depositAmount2);

      await pool.stake({
        from: sender2,
        value: depositAmount2,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: depositAmount2,
      });

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    it('places deposit of user to the activation queue with exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit more than 0.01 %
      let depositAmount = ether('32').mul(new BN(2));
      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      // check deposit amount placed in activation queue
      let receipt = await pool.stake({
        from: sender1,
        value: depositAmount,
      });
      await expectEvent(receipt, 'ActivationScheduled', {
        sender: sender1,
        validatorIndex,
        value: depositAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(depositAmount);

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
      expect(await stakedEthToken.totalSupply()).to.bignumber.equal(
        totalSupply
      );
    });

    it('activates deposit of user immediately with not exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1000', { from: admin }); // 10 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit less than 10 %
      let depositAmount = ether('32');
      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(new BN(1));
      totalSupply = totalSupply.add(depositAmount);

      // check deposit amount added immediately
      await pool.stake({
        from: sender1,
        value: depositAmount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(new BN(0));

      // check contract balance
      expect(await balance.current(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    it('can stake to different recipient address', async () => {
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await pool.stakeOnBehalf(sender2, {
        from: sender1,
        value: amount,
      });
      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender2,
        value: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });
    });

    it('can stake without recipient address', async () => {
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await pool.stake({
        from: sender1,
        value: amount,
      });
      await expectEvent.inTransaction(receipt.tx, StakedEthToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value: amount,
      });
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: amount,
      });
    });

    describe('staking with partner', () => {
      const partner = otherAccounts[0];

      it('can stake with partner', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let receipt = await pool.stakeWithPartner(partner, {
          from: sender1,
          value: amount,
        });
        await expectEvent(receipt, 'StakedWithPartner', {
          partner,
          amount,
        });
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender1,
          balance: amount,
        });
      });

      it('can stake with partner to different recipient address', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let receipt = await pool.stakeWithPartnerOnBehalf(partner, sender2, {
          from: sender1,
          value: amount,
        });
        await expectEvent(receipt, 'StakedWithPartner', {
          partner,
          amount,
        });
        await expectEvent.inTransaction(
          receipt.tx,
          StakedEthToken,
          'Transfer',
          {
            from: constants.ZERO_ADDRESS,
            to: sender2,
            value: amount,
          }
        );
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender2,
          balance: amount,
        });
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender1,
          balance: new BN(0),
        });
      });
    });

    describe('staking with referrer', () => {
      const referrer = otherAccounts[0];

      it('can stake with referrer', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let receipt = await pool.stakeWithReferrer(referrer, {
          from: sender1,
          value: amount,
        });
        await expectEvent(receipt, 'StakedWithReferrer', {
          referrer,
          amount,
        });
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender1,
          balance: amount,
        });
      });

      it('can stake with referrer to different recipient address', async () => {
        let amount = ether('1');
        totalSupply = totalSupply.add(amount);

        let receipt = await pool.stakeWithReferrerOnBehalf(referrer, sender2, {
          from: sender1,
          value: amount,
        });
        await expectEvent(receipt, 'StakedWithReferrer', {
          referrer,
          amount,
        });
        await expectEvent.inTransaction(
          receipt.tx,
          StakedEthToken,
          'Transfer',
          {
            from: constants.ZERO_ADDRESS,
            to: sender2,
            value: amount,
          }
        );
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender2,
          balance: amount,
        });
        await checkStakedEthToken({
          stakedEthToken,
          totalSupply,
          account: sender1,
          balance: new BN(0),
        });
      });
    });
  });

  describe('activating', () => {
    let validatorIndex, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.stake({
        from: sender1,
        value: depositAmount,
      });
      poolBalance = await balance.current(pool.address);
      validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      for (
        let i = 0;
        i < validatorIndex.sub(activatedValidators).sub(pendingValidators);
        i++
      ) {
        validatorsDepositRoot = await depositContract.get_deposit_root();
        await registerValidators({
          depositData: [
            {
              operator,
              withdrawalCredentials: depositData[i].withdrawalCredentials,
              depositDataRoot: depositData[i].depositDataRoot,
              publicKey: depositData[i].publicKey,
              signature: depositData[i].signature,
            },
          ],
          merkleProofs: [depositData[i].merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        });
      }
    });

    it('fails to activate with invalid validator index', async () => {
      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pool: validator is not active yet'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      await expectRevert(
        pool.activate(sender2, validatorIndex, {
          from: sender1,
        }),
        'Pool: invalid validator index'
      );
    });

    it('fails to activate deposit amount twice', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      await pool.activate(sender1, validatorIndex, {
        from: sender1,
      });

      await expectRevert(
        pool.activate(sender1, validatorIndex, {
          from: sender1,
        }),
        'Pool: invalid validator index'
      );
    });

    it('activates deposit amount', async () => {
      await pool.setActivatedValidators(validatorIndex, {
        from: admin,
      });
      expect(await pool.canActivate(validatorIndex)).to.equal(true);
      let receipt = await pool.activate(sender1, validatorIndex, {
        from: sender1,
      });
      await expectEvent(receipt, 'Activated', {
        account: sender1,
        validatorIndex,
        value: depositAmount,
        sender: sender1,
      });
      totalSupply = totalSupply.add(depositAmount);

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });
    });
  });

  describe('activating multiple', () => {
    let validatorIndex1, validatorIndex2, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await pool.stake({
        from: sender3,
        value: depositAmount,
      });
      poolBalance = poolBalance.add(depositAmount);
      validatorIndex1 = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      await pool.stake({
        from: sender3,
        value: depositAmount,
      });
      poolBalance = poolBalance.add(depositAmount);
      validatorIndex2 = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      for (
        let i = 0;
        i < validatorIndex2.sub(activatedValidators).sub(pendingValidators);
        i++
      ) {
        validatorsDepositRoot = await depositContract.get_deposit_root();
        await registerValidators({
          depositData: [
            {
              operator,
              withdrawalCredentials: depositData[i].withdrawalCredentials,
              depositDataRoot: depositData[i].depositDataRoot,
              publicKey: depositData[i].publicKey,
              signature: depositData[i].signature,
            },
          ],
          merkleProofs: [depositData[i].merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        });
      }
    });

    it('fails to activate with invalid validator indexes', async () => {
      await expectRevert(
        pool.activateMultiple(
          sender3,
          [validatorIndex1.add(new BN(2)), validatorIndex2.add(new BN(3))],
          {
            from: sender3,
          }
        ),
        'Pool: validator is not active yet'
      );
    });

    it('fails to activate in paused pool', async () => {
      await pool.pause({ from: admin });
      expect(await pool.paused()).equal(true);

      await expectRevert(
        pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pausable: paused'
      );
    });

    it('fails to activate not existing deposit', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      await expectRevert(
        pool.activateMultiple(sender2, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pool: invalid validator index'
      );
    });

    it('fails to activate multiple deposit amounts twice', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      await pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
        from: sender3,
      });

      await expectRevert(
        pool.activateMultiple(sender3, [validatorIndex1, validatorIndex2], {
          from: sender3,
        }),
        'Pool: invalid validator index'
      );
    });

    it('activates multiple deposit amounts', async () => {
      await pool.setActivatedValidators(validatorIndex2, {
        from: admin,
      });
      expect(await pool.canActivate(validatorIndex1)).to.equal(true);
      expect(await pool.canActivate(validatorIndex2)).to.equal(true);
      let receipt = await pool.activateMultiple(
        sender3,
        [validatorIndex1, validatorIndex2],
        {
          from: sender3,
        }
      );
      totalSupply = totalSupply.add(depositAmount.mul(new BN(2)));

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender3,
        balance: depositAmount.mul(new BN(2)),
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        validatorIndex: validatorIndex1,
        value: depositAmount,
        sender: sender3,
      });
      await expectEvent.inTransaction(receipt.tx, Pool, 'Activated', {
        account: sender3,
        validatorIndex: validatorIndex2,
        value: depositAmount,
        sender: sender3,
      });
    });
  });

  it('only PoolValidators contract can register new validators', async () => {
    const { publicKey, signature, withdrawalCredentials, depositDataRoot } =
      depositData[0];
    await expectRevert(
      pool.registerValidator(
        {
          operator,
          withdrawalCredentials,
          depositDataRoot,
          publicKey,
          signature,
        },
        {
          from: sender1,
        }
      ),
      'Pool: access denied'
    );
  });
});
