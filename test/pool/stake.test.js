const { expect } = require('chai');
const {
  ether,
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
  registerValidator,
  setupOracleAccounts,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  checkStakedToken,
  mintMGNOTokens,
  stakeGNO,
  stakeMGNO,
  stakeGNOWithPermit,
} = require('../utils');
const {
  depositData,
  depositDataMerkleRoot,
  withdrawalCredentials,
} = require('./depositDataMerkleRoot');

const Pool = artifacts.require('Pool');
const StakedToken = artifacts.require('StakedToken');
const PoolValidators = artifacts.require('PoolValidators');
const Oracles = artifacts.require('Oracles');
const IDepositContract = artifacts.require('IDepositContract');
const IGCToken = artifacts.require('IGCToken');

contract('Pool (stake)', (accounts) => {
  const admin = contractSettings.admin;
  let [sender1, sender2, sender3, operator, ...otherAccounts] = accounts;
  let pool,
    stakedToken,
    mgnoToken,
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
    let upgradedContracts = await upgradeContracts(withdrawalCredentials);

    mgnoToken = await IGCToken.at(contracts.MGNOToken);
    pool = await Pool.at(upgradedContracts.pool);
    stakedToken = await StakedToken.at(upgradedContracts.stakedToken);
    validators = await PoolValidators.at(upgradedContracts.poolValidators);
    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
    depositContract = await IDepositContract.at(
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

    totalSupply = await stakedToken.totalSupply();
    poolBalance = await mgnoToken.balanceOf(pool.address);
    activatedValidators = await pool.activatedValidators();
    pendingValidators = await pool.pendingValidators();
  });

  afterEach(async () => resetFork());

  describe('stake mGNO', async () => {
    it('fails to stake with zero amount', async () => {
      await expectRevert(
        pool.stakeMGNO(
          ether('0'),
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS,
          false,
          {
            from: sender1,
          }
        ),
        'Pool: invalid deposit amount'
      );
    });

    it('fails to stake with no allowance', async () => {
      await expectRevert(
        stakeMGNO({
          account: sender1,
          amount: ether('1'),
          pool,
          noAllowance: true,
        }),
        'ERC20: transfer amount exceeds allowance'
      );
    });

    it('mints tokens for users with deposit less than min activating', async () => {
      // User 1 creates a deposit
      let maxAmount = ether('0.01');
      await pool.setMinActivatingDeposit(maxAmount, { from: admin });
      let depositAmount1 = getDepositAmount({
        max: maxAmount,
      });
      let gnoAmount1 = await pool.calculateGNO(depositAmount1);
      totalSupply = totalSupply.add(gnoAmount1);
      poolBalance = poolBalance.add(depositAmount1);

      await stakeMGNO({
        account: sender1,
        amount: depositAmount1,
        pool,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: gnoAmount1,
      });

      // User 2 creates a deposit
      let depositAmount2 = getDepositAmount({
        max: maxAmount,
      });
      let gnoAmount2 = await pool.calculateGNO(depositAmount2);
      totalSupply = totalSupply.add(gnoAmount2);
      poolBalance = poolBalance.add(depositAmount2);

      await stakeMGNO({
        account: sender2,
        amount: depositAmount2,
        pool,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: gnoAmount2,
      });

      // check contract balance
      expect(await mgnoToken.balanceOf(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    // TODO: re-enable once activations enabled
    it.skip('places deposit of user to the activation queue with exceeded pending validators limit', async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      // deposit more than 0.01 %
      let depositAmount = ether('32').mul(new BN(2));
      let gnoAmount = await pool.calculateGNO(depositAmount);

      poolBalance = poolBalance.add(depositAmount);
      let validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      // check deposit amount placed in activation queue
      let receipt = await stakeMGNO({
        account: sender1,
        amount: depositAmount,
        pool,
      });
      await expectEvent(receipt, 'ActivationScheduled', {
        sender: sender1,
        validatorIndex,
        value: gnoAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(gnoAmount);

      // check contract balance
      expect(await mgnoToken.balanceOf(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
      expect(await stakedToken.totalSupply()).to.bignumber.equal(totalSupply);
    });

    // TODO: re-enable once activations enabled
    it.skip('activates deposit of user immediately with not exceeded pending validators limit', async () => {
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
      await stakeMGNO({
        account: sender1,
        amount: depositAmount,
        pool,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });
      expect(
        await pool.activations(sender1, validatorIndex)
      ).to.bignumber.equal(new BN(0));

      // check contract balance
      expect(await mgnoToken.balanceOf(pool.address)).to.be.bignumber.equal(
        poolBalance
      );
    });

    it('can stake to different recipient address', async () => {
      let amount = ether('1');
      let gnoAmount = await pool.calculateGNO(amount);

      totalSupply = totalSupply.add(gnoAmount);

      let receipt = await stakeMGNO({
        account: sender1,
        amount: amount,
        recipient: sender2,
        pool,
      });
      await expectEvent.inTransaction(receipt.tx, StakedToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender2,
        value: gnoAmount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: gnoAmount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });
    });

    it('can stake with partner', async () => {
      let amount = ether('1');
      let gnoAmount = await pool.calculateGNO(amount);

      const partner = otherAccounts[0];
      totalSupply = totalSupply.add(gnoAmount);

      let receipt = await stakeMGNO({
        referrer: partner,
        account: sender1,
        amount: amount,
        hasRevenueShare: true,
        pool,
      });
      await expectEvent(receipt, 'StakedWithPartner', {
        partner,
        amount: gnoAmount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: gnoAmount,
      });
    });

    it('can stake with referrer', async () => {
      const referrer = otherAccounts[0];
      let amount = ether('1');
      let gnoAmount = await pool.calculateGNO(amount);

      totalSupply = totalSupply.add(gnoAmount);

      let receipt = await stakeMGNO({
        referrer: referrer,
        account: sender1,
        amount: amount,
        pool,
      });
      await expectEvent(receipt, 'StakedWithReferrer', {
        referrer,
        amount: gnoAmount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: gnoAmount,
      });
    });
  });

  describe('stake GNO', async () => {
    it('fails to stake with zero amount', async () => {
      await expectRevert(
        pool.stakeGNO(
          ether('0'),
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS,
          false,
          {
            from: sender1,
          }
        ),
        'Pool: invalid deposit amount'
      );
    });

    it('fails to stake with no allowance', async () => {
      await expectRevert(
        stakeGNO({
          account: sender1,
          amount: ether('1'),
          pool,
          noAllowance: true,
        }),
        'SafeERC20: low-level call failed'
      );
    });

    it('can stake to different recipient address', async () => {
      let amount = ether('1');
      console.log((await stakedToken.balanceOf(sender1)).toString());
      let receipt = await stakeGNO({
        account: sender1,
        amount: amount,
        recipient: sender2,
        pool,
      });
      console.log((await stakedToken.balanceOf(sender1)).toString());
      await expectEvent.inTransaction(receipt.tx, StakedToken, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender2,
        value: amount,
      });
      // await checkStakedToken({
      //   stakedToken,
      //   totalSupply,
      //   account: sender2,
      //   balance: amount,
      // });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
      });
    });

    it('can stake with partner', async () => {
      let amount = ether('1');
      const partner = otherAccounts[0];
      totalSupply = totalSupply.add(amount);

      let receipt = await stakeGNO({
        referrer: partner,
        account: sender1,
        amount: amount,
        hasRevenueShare: true,
        pool,
      });
      await expectEvent(receipt, 'StakedWithPartner', {
        partner,
        amount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: amount,
      });
    });

    it('can stake with referrer', async () => {
      const referrer = otherAccounts[0];
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await stakeGNO({
        referrer: referrer,
        account: sender1,
        amount,
        pool,
      });
      await expectEvent(receipt, 'StakedWithReferrer', {
        referrer,
        amount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: amount,
      });
    });
  });

  describe('stake GNO with Permit', async () => {
    let account;

    beforeEach(async () => {
      account = web3.eth.accounts.create();
      await send.ether(sender1, account.address, ether('5'));
    });

    it('fails to stake with zero amount', async () => {
      await expectRevert(
        stakeGNOWithPermit({
          account,
          amount: ether('0'),
          minter: sender1,
          recipient: sender2,
          pool,
        }),
        'Pool: invalid deposit amount'
      );
    });

    it('can stake to different recipient address', async () => {
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await stakeGNOWithPermit({
        account,
        amount,
        minter: sender1,
        recipient: sender2,
        pool,
      });
      await expectEvent.inTransaction(
        receipt.transactionHash,
        StakedToken,
        'Transfer',
        {
          from: constants.ZERO_ADDRESS,
          to: sender2,
          value: amount,
        }
      );
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender2,
        balance: amount,
      });
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: account.address,
        balance: new BN(0),
      });
    });

    it('can stake with partner', async () => {
      let amount = ether('1');
      const partner = otherAccounts[0];
      totalSupply = totalSupply.add(amount);

      let receipt = await stakeGNOWithPermit({
        account,
        minter: sender1,
        referrer: partner,
        amount,
        hasRevenueShare: true,
        pool,
      });
      await expectEvent.inTransaction(
        receipt.transactionHash,
        Pool,
        'StakedWithPartner',
        {
          partner,
          amount,
        }
      );
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: account.address,
        balance: amount,
      });
    });

    it('can stake with referrer', async () => {
      const referrer = otherAccounts[0];
      let amount = ether('1');
      totalSupply = totalSupply.add(amount);

      let receipt = await stakeGNOWithPermit({
        account,
        minter: sender1,
        referrer,
        amount,
        pool,
      });
      await expectEvent.inTransaction(
        receipt.transactionHash,
        Pool,
        'StakedWithReferrer',
        {
          referrer,
          amount,
        }
      );
      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: account.address,
        balance: amount,
      });
    });

    it('fails to stake with invalid permit', async () => {
      let amount = ether('1');
      await expectRevert.unspecified(
        stakeGNOWithPermit({
          account,
          minter: sender1,
          amount: amount,
          pool,
          invalidHolder: true,
        })
      );
    });
  });

  // TODO: re-enable once activations enabled
  describe.skip('activating', () => {
    let validatorIndex, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('1000');
      await stakeGNO({
        account: sender1,
        amount: depositAmount,
        pool,
      });
      poolBalance = poolBalance.add(depositAmount);
      validatorIndex = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      for (let i = 0; i < validatorIndex.sub(activatedValidators); i++) {
        validatorsDepositRoot = await depositContract.get_deposit_root();
        await registerValidator({
          admin,
          validators,
          oracles,
          oracleAccounts,
          operator,
          validatorsDepositRoot,
          merkleProof: depositData[i].merkleProof,
          signature: depositData[i].signature,
          publicKey: depositData[i].publicKey,
          withdrawalCredentials: depositData[i].withdrawalCredentials,
          depositDataRoot: depositData[i].depositDataRoot,
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

      await checkStakedToken({
        stakedToken,
        totalSupply,
        account: sender1,
        balance: depositAmount,
      });
    });
  });

  // TODO: re-enable once activations enabled
  describe.skip('activating multiple', () => {
    let validatorIndex1, validatorIndex2, depositAmount;

    beforeEach(async () => {
      await pool.setPendingValidatorsLimit('1', { from: admin }); // 0.01 %
      await pool.setMinActivatingDeposit(ether('0.01'), { from: admin });

      depositAmount = ether('32');
      await stakeMGNO({
        account: sender3,
        amount: depositAmount,
        pool,
      });
      poolBalance = poolBalance.add(depositAmount);
      validatorIndex1 = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      await stakeMGNO({
        account: sender3,
        amount: depositAmount,
        pool,
      });
      poolBalance = poolBalance.add(depositAmount);
      validatorIndex2 = activatedValidators
        .add(pendingValidators)
        .add(poolBalance.div(ether('32')));

      for (let i = 0; i < validatorIndex2.sub(activatedValidators); i++) {
        validatorsDepositRoot = await depositContract.get_deposit_root();
        await registerValidator({
          admin,
          validators,
          oracles,
          oracleAccounts,
          operator,
          validatorsDepositRoot,
          merkleProof: depositData[i].merkleProof,
          signature: depositData[i].signature,
          publicKey: depositData[i].publicKey,
          withdrawalCredentials: depositData[i].withdrawalCredentials,
          depositDataRoot: depositData[i].depositDataRoot,
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

      await checkStakedToken({
        stakedToken,
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

  it('not admin cannot refund', async () => {
    let amount = ether('10');
    await mintMGNOTokens(sender1, amount);
    await expectRevert(
      pool.refund(amount, {
        from: sender1,
      }),
      'OwnablePausable: access denied'
    );
  });

  it('admin can refund', async () => {
    let amount = ether('10');
    await mintMGNOTokens(admin, amount);
    await mgnoToken.approve(pool.address, amount, { from: admin });

    let receipt = await pool.refund(amount, {
      from: admin,
    });
    await expectEvent(receipt, 'Refunded', {
      sender: admin,
      amount,
    });
  });
});
