const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  checkStakedEthToken,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const StakedEthToken = artifacts.require('StakedEthToken');
const Pool = artifacts.require('Pool');

contract('StakedEthToken', ([sender1, sender2]) => {
  const admin = contractSettings.admin;
  let stakedEthToken, pool, totalSupply;

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(sender1, admin, ether('5'));

    await upgradeContracts();

    stakedEthToken = await StakedEthToken.at(contracts.stakedEthToken);
    pool = await Pool.at(contracts.pool);

    totalSupply = await stakedEthToken.totalSupply();
  });

  after(async () => stopImpersonatingAccount(admin));

  afterEach(async () => resetFork());

  describe('mint', () => {
    it('anyone cannot mint sETH2 tokens', async () => {
      await expectRevert(
        stakedEthToken.mint(sender1, ether('10'), {
          from: sender1,
        }),
        'StakedEthToken: access denied'
      );
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });
    });
  });

  describe('transfer', () => {
    let value = ether('10');

    beforeEach(async () => {
      await pool.setMinActivatingDeposit(value.add(ether('1')), {
        from: admin,
      });
      await pool.addDeposit({
        from: sender1,
        value,
      });
      totalSupply = totalSupply.add(value);
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        stakedEthToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'StakedEthToken: invalid receiver'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        stakedEthToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'StakedEthToken: invalid sender'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer zero amount', async () => {
      let receipt = await stakedEthToken.transfer(sender2, ether('0'), {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: ether('0'),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await stakedEthToken.pause({ from: admin });
      expect(await stakedEthToken.paused()).equal(true);

      await expectRevert(
        stakedEthToken.transfer(sender2, value, {
          from: sender1,
        }),
        'Pausable: paused'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
        deposit: value,
      });
      await stakedEthToken.unpause({ from: admin });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        stakedEthToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'StakedEthToken: invalid amount'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer sETH2 tokens to different account', async () => {
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply,
        account: sender2,
        balance: value,
        deposit: value,
      });
    });
  });
});
