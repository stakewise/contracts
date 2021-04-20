const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  ether,
  send,
  time,
  BN,
  constants,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../../deployments');
const { contractSettings } = require('../../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');

const VestingEscrowFactory = artifacts.require('VestingEscrowFactory');
const StakeWiseToken = artifacts.require('StakeWiseToken');

contract('VestingEscrowFactory', ([recipient, beneficiary, anyone]) => {
  const admin = contractSettings.admin;
  const vestedAmount = ether('10000');

  let vestingEscrowFactory, stakeWiseToken;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let contracts = await upgradeContracts();
    vestingEscrowFactory = await VestingEscrowFactory.at(
      contracts.vestingEscrowFactory
    );
    stakeWiseToken = await StakeWiseToken.at(contracts.stakeWiseToken);
  });

  afterEach(async () => resetFork());

  it('fails to deploy escrow when paused', async () => {
    await vestingEscrowFactory.pause({ from: admin });
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        recipient,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: admin,
        }
      ),
      'Pausable: paused'
    );
  });

  it('fails to deploy escrow when not admin', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        recipient,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: anyone,
        }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to deploy escrow with invalid cliff', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        recipient,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.years(5),
        {
          from: admin,
        }
      ),
      'VestingEscrowFactory: invalid cliff'
    );
  });

  it('fails to deploy escrow with no token allowance', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        recipient,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: admin,
        }
      ),
      'SafeMath: subtraction overflow'
    );
  });

  it('fails to deploy escrow with invalid recipient', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        constants.ZERO_ADDRESS,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: admin,
        }
      ),
      'PoolEscrow: recipient is the zero address'
    );
  });

  it('fails to deploy escrow with invalid beneficiary', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        stakeWiseToken.address,
        recipient,
        constants.ZERO_ADDRESS,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: admin,
        }
      ),
      'PoolEscrow: beneficiary is the zero address'
    );
  });

  it('fails to deploy escrow with invalid token', async () => {
    await expectRevert(
      vestingEscrowFactory.deployEscrow(
        constants.ZERO_ADDRESS,
        recipient,
        beneficiary,
        vestedAmount,
        0,
        time.duration.years(4),
        time.duration.days(180),
        {
          from: admin,
        }
      ),
      'Address: call to non-contract'
    );
  });

  it('deploys escrow for the recipient', async () => {
    await stakeWiseToken.approve(vestingEscrowFactory.address, vestedAmount, {
      from: admin,
    });
    let startTime = await time.latest();
    let receipt = await vestingEscrowFactory.deployEscrow(
      stakeWiseToken.address,
      recipient,
      beneficiary,
      vestedAmount,
      startTime,
      time.duration.years(4),
      time.duration.days(180),
      {
        from: admin,
      }
    );
    expect(await vestingEscrowFactory.balanceOf(recipient)).to.bignumber.equal(
      vestedAmount
    );
    expectEvent(receipt, 'VestingEscrowCreated', {
      admin,
      token: stakeWiseToken.address,
      recipient,
      beneficiary,
      totalAmount: vestedAmount,
      startTime,
      endTime: startTime.add(time.duration.years(4)),
      cliffLength: time.duration.days(180),
    });
  });

  it('deploys multiple escrows for the recipient', async () => {
    // deploy first escrow
    await stakeWiseToken.approve(vestingEscrowFactory.address, vestedAmount, {
      from: admin,
    });
    let startTime = await time.latest();
    let receipt = await vestingEscrowFactory.deployEscrow(
      stakeWiseToken.address,
      recipient,
      beneficiary,
      vestedAmount,
      startTime,
      time.duration.years(4),
      time.duration.days(180),
      {
        from: admin,
      }
    );
    expect(await vestingEscrowFactory.balanceOf(recipient)).to.bignumber.equal(
      vestedAmount
    );
    expectEvent(receipt, 'VestingEscrowCreated', {
      admin,
      token: stakeWiseToken.address,
      recipient,
      beneficiary,
      totalAmount: vestedAmount,
      startTime,
      endTime: startTime.add(time.duration.years(4)),
      cliffLength: time.duration.days(180),
    });

    // deploy second escrow
    await stakeWiseToken.approve(vestingEscrowFactory.address, vestedAmount, {
      from: admin,
    });
    receipt = await vestingEscrowFactory.deployEscrow(
      stakeWiseToken.address,
      recipient,
      beneficiary,
      vestedAmount,
      startTime,
      time.duration.years(4),
      time.duration.days(180),
      {
        from: admin,
      }
    );
    expect(await vestingEscrowFactory.balanceOf(recipient)).to.bignumber.equal(
      vestedAmount.mul(new BN(2))
    );
    expectEvent(receipt, 'VestingEscrowCreated', {
      admin,
      token: stakeWiseToken.address,
      recipient,
      beneficiary,
      totalAmount: vestedAmount,
      startTime,
      endTime: startTime.add(time.duration.years(4)),
      cliffLength: time.duration.days(180),
    });
  });
});
