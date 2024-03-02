const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  ether,
  send,
  BN,
  constants,
  balance,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  mintGNOTokens,
  mintMGNOTokens,
} = require('../utils');

const PoolEscrow = artifacts.require('PoolEscrow');
const IGCToken = artifacts.require('IGCToken');

contract('PoolEscrow', ([anyone, newOwner, payee, vault]) => {
  const owner = contractSettings.admin;
  let poolEscrow, mgnoToken, gnoToken;

  after(async () => stopImpersonatingAccount(owner));

  beforeEach(async () => {
    await impersonateAccount(owner);
    await send.ether(anyone, owner, ether('5'));

    let upgradedContracts = await upgradeContracts(vault);
    poolEscrow = await PoolEscrow.at(upgradedContracts.poolEscrow);
    mgnoToken = await IGCToken.at(contracts.MGNOToken);
    gnoToken = await IGCToken.at(contracts.GNOToken);
  });

  afterEach(async () => resetFork());

  it('sets owner on the contract creation', async () => {
    expect(await poolEscrow.owner()).to.equal(owner);
  });

  it('can receive xDAI transfers', async () => {
    let amount = ether('5');
    await send.ether(anyone, poolEscrow.address, amount);
    expect(await balance.current(poolEscrow.address)).to.bignumber.equal(
      amount
    );
  });

  it('can receive GNO transfers', async () => {
    const balanceBefore = await gnoToken.balanceOf(poolEscrow.address);
    let amount = ether('5');
    await mintGNOTokens(gnoToken, anyone, amount);
    await gnoToken.transfer(poolEscrow.address, amount, { from: anyone });
    expect(await gnoToken.balanceOf(poolEscrow.address)).to.bignumber.equal(
      balanceBefore.add(amount)
    );
  });

  describe('commit ownership transfer', () => {
    it('owner can commit ownership transfer', async () => {
      let receipt = await poolEscrow.commitOwnershipTransfer(newOwner, {
        from: owner,
      });
      expectEvent(receipt, 'OwnershipTransferCommitted', {
        currentOwner: owner,
        futureOwner: newOwner,
      });
      expect(await poolEscrow.futureOwner()).to.equal(newOwner);
      expect(await poolEscrow.owner()).to.equal(owner);

      // future owner cannot yet perform any actions
      await expectRevert(
        poolEscrow.withdraw(newOwner, ether('1'), {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('fails to commit ownership transfer if not an owner', async () => {
      await expectRevert(
        poolEscrow.commitOwnershipTransfer(newOwner, {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('can commit ownership transfer to zero address', async () => {
      let receipt = await poolEscrow.commitOwnershipTransfer(
        constants.ZERO_ADDRESS,
        {
          from: owner,
        }
      );
      expectEvent(receipt, 'OwnershipTransferCommitted', {
        currentOwner: owner,
        futureOwner: constants.ZERO_ADDRESS,
      });
      expect(await poolEscrow.futureOwner()).to.equal(constants.ZERO_ADDRESS);
      expect(await poolEscrow.owner()).to.equal(owner);
    });
  });

  describe('apply ownership transfer', () => {
    it('future owner can apply ownership transfer', async () => {
      await poolEscrow.commitOwnershipTransfer(newOwner, {
        from: owner,
      });

      let receipt = await poolEscrow.applyOwnershipTransfer({
        from: newOwner,
      });
      expectEvent(receipt, 'OwnershipTransferApplied', {
        previousOwner: owner,
        newOwner,
      });
      expect(await poolEscrow.futureOwner()).to.equal(constants.ZERO_ADDRESS);
      expect(await poolEscrow.owner()).to.equal(newOwner);
    });

    it('fails to apply ownership transfer if not a future owner', async () => {
      await poolEscrow.commitOwnershipTransfer(newOwner, {
        from: owner,
      });

      await expectRevert(
        poolEscrow.applyOwnershipTransfer({
          from: owner,
        }),
        'PoolEscrow: caller is not the future owner'
      );
    });

    it('fails to apply ownership transfer if not committed', async () => {
      await expectRevert(
        poolEscrow.applyOwnershipTransfer({
          from: newOwner,
        }),
        'PoolEscrow: caller is not the future owner'
      );
    });
  });

  describe('withdraw xDAI', () => {
    it('owner can withdraw xDAI from the escrow', async () => {
      let amount = ether('5');
      await send.ether(anyone, poolEscrow.address, amount);

      let payeeBalance = await balance.current(payee);
      let receipt = await poolEscrow.withdraw(payee, amount, {
        from: owner,
      });
      expectEvent(receipt, 'Withdrawn', {
        sender: owner,
        payee,
        amount,
      });
      expect(await balance.current(poolEscrow.address)).to.bignumber.equal(
        new BN(0)
      );
      expect(await balance.current(payee)).to.bignumber.equal(
        payeeBalance.add(amount)
      );
    });

    it('fails to withdraw xDAI without admin role', async () => {
      let amount = ether('5');
      await send.ether(anyone, poolEscrow.address, amount);
      await expectRevert(
        poolEscrow.withdraw(payee, amount, {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('fails to withdraw xDAI with invalid payee address', async () => {
      let amount = ether('5');
      await send.ether(anyone, poolEscrow.address, amount);
      await expectRevert(
        poolEscrow.withdraw(constants.ZERO_ADDRESS, amount, {
          from: owner,
        }),
        'PoolEscrow: payee is the zero address'
      );
    });

    it('fails to withdraw xDAI when not enough balance', async () => {
      let amount = ether('5');
      await expectRevert(
        poolEscrow.withdraw(payee, amount, {
          from: owner,
        }),
        'Address: insufficient balance'
      );
    });
  });

  describe('withdraw tokens', () => {
    it('owner can withdraw tokens from the escrow', async () => {
      let amount = ether('5');
      await mintMGNOTokens(mgnoToken, anyone, amount);
      await mgnoToken.transfer(poolEscrow.address, amount);

      let payeeBalance = await mgnoToken.balanceOf(payee);
      let receipt = await poolEscrow.withdrawTokens(
        mgnoToken.address,
        payee,
        amount,
        {
          from: owner,
        }
      );
      expectEvent(receipt, 'Withdrawn', {
        sender: owner,
        payee,
        amount,
      });
      expect(await mgnoToken.balanceOf(poolEscrow.address)).to.bignumber.equal(
        new BN(0)
      );
      expect(await mgnoToken.balanceOf(payee)).to.bignumber.equal(
        payeeBalance.add(amount)
      );
    });

    it('fails to withdraw tokens without admin role', async () => {
      let amount = ether('5');
      await mintMGNOTokens(mgnoToken, anyone, amount);
      await mgnoToken.transfer(poolEscrow.address, amount);

      await expectRevert(
        poolEscrow.withdrawTokens(mgnoToken.address, payee, amount, {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('fails to withdraw tokens with invalid payee address', async () => {
      let amount = ether('5');
      await mintMGNOTokens(mgnoToken, anyone, amount);
      await mgnoToken.transfer(poolEscrow.address, amount);

      await expectRevert(
        poolEscrow.withdrawTokens(
          mgnoToken.address,
          constants.ZERO_ADDRESS,
          amount,
          {
            from: owner,
          }
        ),
        'PoolEscrow: payee is the zero address'
      );
    });

    it('fails to withdraw with invalid token address', async () => {
      let amount = ether('5');
      await mintMGNOTokens(mgnoToken, anyone, amount);
      await mgnoToken.transfer(poolEscrow.address, amount);

      await expectRevert(
        poolEscrow.withdrawTokens(
          constants.ZERO_ADDRESS,
          constants.ZERO_ADDRESS,
          amount,
          {
            from: owner,
          }
        ),
        'PoolEscrow: payee is the zero address'
      );
    });

    it('fails to withdraw tokens when not enough balance', async () => {
      let amount = ether('5');
      await expectRevert(
        poolEscrow.withdrawTokens(mgnoToken.address, payee, amount, {
          from: owner,
        }),
        'ERC20: transfer amount exceeds balance'
      );
    });
  });
});
