const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  ether,
  send,
  time,
  BN,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');

const VestingEscrowFactory = artifacts.require('VestingEscrowFactory');
const VestingEscrow = artifacts.require('VestingEscrow');
const StakeWiseToken = artifacts.require('StakeWiseToken');

contract('VestingEscrow', ([recipient, beneficiary, anyone]) => {
  const admin = contractSettings.admin;
  const totalAmount = ether('10000');
  const vestingDuration = time.duration.days(1460);
  const cliffLength = time.duration.days(292);
  let vestingEscrowFactory, stakeWiseToken, startTime, endTime, escrow;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let contracts = await upgradeContracts();
    vestingEscrowFactory = await VestingEscrowFactory.at(
      contracts.vestingEscrowFactory
    );
    stakeWiseToken = await StakeWiseToken.at(contracts.stakeWiseToken);
    await stakeWiseToken.approve(vestingEscrowFactory.address, totalAmount, {
      from: admin,
    });
    startTime = await time.latest();
    endTime = startTime.add(vestingDuration);
    let receipt = await vestingEscrowFactory.deployEscrow(
      stakeWiseToken.address,
      recipient,
      totalAmount,
      startTime,
      vestingDuration,
      cliffLength,
      {
        from: admin,
      }
    );
    escrow = await VestingEscrow.at(receipt.logs[2].args.escrow);
  });

  afterEach(async () => resetFork());

  it('sets variables correctly upon initialization', async () => {
    expect(await escrow.isAdmin(admin)).to.equal(true);
    expect(
      await escrow.getRoleMemberCount(await escrow.DEFAULT_ADMIN_ROLE())
    ).to.bignumber.equal(new BN(1));
    expect(await escrow.token()).to.equal(stakeWiseToken.address);
    expect(await escrow.recipient()).to.equal(recipient);
    expect(await escrow.totalAmount()).to.bignumber.equal(totalAmount);
    expect(await escrow.claimedAmount()).to.bignumber.equal(new BN(0));
    expect(await escrow.startTime()).to.bignumber.equal(startTime);
    expect(await escrow.endTime()).to.bignumber.equal(endTime);
    expect(await escrow.cliffLength()).to.bignumber.equal(cliffLength);
    expect(await escrow.unclaimedAmount()).to.bignumber.equal(totalAmount);
    expect(await escrow.vestedAmount()).to.bignumber.equal(new BN(0));
    expect(await stakeWiseToken.balanceOf(escrow.address)).to.bignumber.equal(
      totalAmount
    );
  });

  it('calculates vested amount correctly', async () => {
    // no vested amount on start
    expect(await escrow.vestedAmount()).to.bignumber.equal(new BN(0));

    // half of cliff has passed -> still no vested amount
    let halfCliff = cliffLength.div(new BN(2));
    await time.increase(halfCliff);
    expect(await escrow.vestedAmount()).to.bignumber.equal(new BN(0));

    // another half of cliff has passed -> 20% of vested amount claimable
    await time.increase(halfCliff);
    let vestedAmount = await escrow.vestedAmount();
    let expectedAmount = totalAmount.mul(new BN(20)).div(new BN(100));
    expect(vestedAmount).to.bignumber.gte(expectedAmount);
    expect(vestedAmount).to.bignumber.lte(expectedAmount.add(ether('1')));

    // another 20% of vesting time passed -> another 20% of vested amount claimable
    await time.increase(cliffLength);
    vestedAmount = await escrow.vestedAmount();
    expectedAmount = totalAmount.mul(new BN(40)).div(new BN(100));
    expect(vestedAmount).to.bignumber.gte(expectedAmount);
    expect(vestedAmount).to.bignumber.lte(expectedAmount.add(ether('1')));

    // vesting time has ended -> total vested amount unlocked
    await time.increaseTo(endTime);
    expect(await escrow.vestedAmount()).to.bignumber.eq(totalAmount);
  });

  describe('stoppage', () => {
    it('admin can stop vesting escrow', async () => {
      let receipt = await escrow.stop(beneficiary, {
        from: admin,
      });
      expectEvent(receipt, 'Stopped', {
        sender: admin,
        beneficiary,
        amount: totalAmount,
      });
      expect(await stakeWiseToken.balanceOf(beneficiary)).to.bignumber.equal(
        totalAmount
      );
    });

    it('admin can stop vesting escrow when some amount was already claimed', async () => {
      await time.increase(cliffLength);
      let vestedAmount = await escrow.vestedAmount();
      await escrow.claim(recipient, vestedAmount, {
        from: recipient,
      });
      expect(await stakeWiseToken.balanceOf(recipient)).to.bignumber.equal(
        vestedAmount
      );

      let receipt = await escrow.stop(beneficiary, {
        from: admin,
      });
      expectEvent(receipt, 'Stopped', {
        sender: admin,
        beneficiary,
        amount: totalAmount.sub(vestedAmount),
      });
      expect(await stakeWiseToken.balanceOf(beneficiary)).to.bignumber.equal(
        totalAmount.sub(vestedAmount)
      );
    });

    it('fails to stop vesting escrow when full amount was already claimed', async () => {
      await time.increaseTo(endTime);
      await escrow.claim(recipient, totalAmount, {
        from: recipient,
      });
      expect(await stakeWiseToken.balanceOf(recipient)).to.bignumber.equal(
        totalAmount
      );

      await expectRevert(
        escrow.stop(beneficiary, {
          from: admin,
        }),
        'VestingEscrow: nothing to pull'
      );
      expect(await stakeWiseToken.balanceOf(beneficiary)).to.bignumber.equal(
        new BN(0)
      );
    });

    it('not admin cannot stop vesting escrow', async () => {
      await expectRevert(
        escrow.stop(beneficiary, {
          from: recipient,
        }),
        'OwnablePausable: access denied'
      );
    });
  });

  describe('claim', () => {
    let vestedAmount = totalAmount.mul(new BN(20)).div(new BN(100));

    beforeEach(async () => {
      await time.increase(cliffLength);
    });

    it('recipient can claim unlocked tokens', async () => {
      let receipt = await escrow.claim(beneficiary, vestedAmount, {
        from: recipient,
      });
      expectEvent(receipt, 'Claimed', {
        sender: recipient,
        beneficiary,
        amount: vestedAmount,
      });
      expect(await escrow.claimedAmount()).to.bignumber.equal(vestedAmount);
      expect(
        await vestingEscrowFactory.balanceOf(recipient)
      ).to.bignumber.equal(totalAmount.sub(vestedAmount));
      expect(await stakeWiseToken.balanceOf(beneficiary)).to.bignumber.equal(
        vestedAmount
      );
    });

    it('fails to claim unlocked tokens from not recipient address', async () => {
      await expectRevert(
        escrow.claim(beneficiary, vestedAmount, {
          from: admin,
        }),
        'VestingEscrow: access denied'
      );
    });

    it('fails to claim unlocked tokens when paused', async () => {
      await escrow.pause({ from: admin });
      await expectRevert(
        escrow.claim(beneficiary, vestedAmount, {
          from: recipient,
        }),
        'Pausable: paused'
      );
    });

    it('fails to claim with zero amount', async () => {
      await expectRevert(
        escrow.claim(beneficiary, new BN(0), {
          from: recipient,
        }),
        'VestingEscrow: amount is zero'
      );
    });

    it('fails to claim with invalid amount', async () => {
      await expectRevert(
        escrow.claim(beneficiary, vestedAmount.mul(new BN(2)), {
          from: recipient,
        }),
        'VestingEscrow: invalid amount'
      );
    });

    it('fails to claim multiple times', async () => {
      await time.increaseTo(endTime);

      let receipt = await escrow.claim(beneficiary, totalAmount, {
        from: recipient,
      });
      expectEvent(receipt, 'Claimed', {
        sender: recipient,
        beneficiary,
        amount: totalAmount,
      });
      expect(await escrow.claimedAmount()).to.bignumber.equal(totalAmount);
      expect(
        await vestingEscrowFactory.balanceOf(recipient)
      ).to.bignumber.equal(new BN(0));
      expect(await stakeWiseToken.balanceOf(beneficiary)).to.bignumber.equal(
        totalAmount
      );

      await expectRevert(
        escrow.claim(beneficiary, vestedAmount, {
          from: recipient,
        }),
        'VestingEscrow: invalid amount'
      );
    });
  });
});
