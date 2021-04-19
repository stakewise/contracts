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
const { contractSettings } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');

const PoolEscrow = artifacts.require('PoolEscrow');

contract('PoolEscrow', ([anyone, newOwner, payee]) => {
  const owner = contractSettings.admin;
  let poolEscrow;

  after(async () => stopImpersonatingAccount(owner));

  beforeEach(async () => {
    await impersonateAccount(owner);
    await send.ether(anyone, owner, ether('5'));

    let contracts = await upgradeContracts();
    poolEscrow = await PoolEscrow.at(contracts.poolEscrow);
  });

  afterEach(async () => resetFork());

  it('sets owner on the contract creation', async () => {
    expect(await poolEscrow.owner()).to.equal(owner);
  });

  it('can receive ETH transfers', async () => {
    await send.ether(anyone, poolEscrow.address, ether('5'));
    expect(await balance.current(poolEscrow.address)).to.bignumber.equal(
      ether('5')
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

  describe('withdraw ether', () => {
    it('owner can withdraw ether from the escrow', async () => {
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

    it('fails to withdraw ether without admin role', async () => {
      let amount = ether('5');
      await send.ether(anyone, poolEscrow.address, amount);
      await expectRevert(
        poolEscrow.withdraw(payee, amount, {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('fails to withdraw ether with invalid payee address', async () => {
      let amount = ether('5');
      await send.ether(anyone, poolEscrow.address, amount);
      await expectRevert(
        poolEscrow.withdraw(constants.ZERO_ADDRESS, amount, {
          from: owner,
        }),
        'PoolEscrow: payee is the zero address'
      );
    });

    it('fails to withdraw ether when not enough balance', async () => {
      let amount = ether('5');
      await expectRevert(
        poolEscrow.withdraw(payee, amount, {
          from: owner,
        }),
        'Address: insufficient balance'
      );
    });
  });
});
