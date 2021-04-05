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

  describe('transfer ownership', () => {
    it('owner can transfer ownership', async () => {
      let receipt = await poolEscrow.transferOwnership(newOwner, {
        from: owner,
      });
      expectEvent(receipt, 'OwnershipTransferred', {
        previousOwner: owner,
        newOwner: newOwner,
      });
      expect(await poolEscrow.owner()).to.equal(newOwner);
    });

    it('fails to transfer ownership if not an owner', async () => {
      await expectRevert(
        poolEscrow.transferOwnership(newOwner, {
          from: newOwner,
        }),
        'PoolEscrow: caller is not the owner'
      );
    });

    it('fails to transfer ownership to zero address', async () => {
      await expectRevert(
        poolEscrow.transferOwnership(constants.ZERO_ADDRESS, {
          from: owner,
        }),
        'PoolEscrow: new owner is the zero address'
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
