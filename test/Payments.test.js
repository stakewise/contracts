const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  time,
  BN,
  ether,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeManagers,
  deployAndInitializeOperators,
} = require('../deployments/access');
const { deployAndInitializePayments } = require('../deployments/payments');
const {
  deployAndInitializeSettings,
  initialSettings,
} = require('../deployments/settings');
const { deployAndInitializeERC20Mock } = require('../deployments/tokens');

const Managers = artifacts.require('Managers');
const Payments = artifacts.require('Payments');
const Settings = artifacts.require('Settings');
const ERC20Mock = artifacts.require('ERC20Mock');

contract('Payments', ([_, ...accounts]) => {
  let payments, settings, daiToken, managers;
  let [admin, manager, sender1, sender2, anyone] = accounts;
  let balance = ether('1');

  before(async () => {
    // deploy admins
    let adminsAddress = await deployAndInitializeAdmins(admin);

    // deploy and configure manager
    managers = await Managers.at(
      await deployAndInitializeManagers(adminsAddress)
    );
    await managers.addManager(manager, { from: admin });

    // deploy settings
    let operatorsAddress = await deployAndInitializeOperators(adminsAddress);
    settings = await Settings.at(
      await deployAndInitializeSettings(adminsAddress, operatorsAddress)
    );
  });

  beforeEach(async () => {
    daiToken = await ERC20Mock.at(
      await deployAndInitializeERC20Mock(admin, 'DAI Token', 'DAI')
    );
    await settings.setSupportedPaymentTokens(daiToken.address, true, {
      from: admin,
    });

    payments = await Payments.at(
      await deployAndInitializePayments(settings.address, managers.address)
    );
  });

  describe('adding tokens', () => {
    it('fails to add tokens to paused contract', async () => {
      await settings.setPausedContracts(payments.address, true, {
        from: admin,
      });
      await expectRevert(
        payments.addTokens(daiToken.address, balance, {
          from: sender1,
        }),
        'Payments: contract is paused'
      );
    });

    it('fails to add unsupported tokens', async () => {
      await expectRevert(
        payments.addTokens(anyone, balance, {
          from: sender1,
        }),
        'Payments: token is not supported'
      );
    });

    it('fails to transfer without allowance', async () => {
      for (const user of [sender1, sender2]) {
        await expectRevert.unspecified(
          payments.addTokens(anyone, balance, {
            from: user,
          })
        );
      }
    });

    it('fails to transfer with low balance', async () => {
      for (const user of [sender1, sender2]) {
        await daiToken.approve(payments.address, balance, {
          from: user,
        });
        await expectRevert.unspecified(
          payments.addTokens(daiToken.address, balance, {
            from: user,
          })
        );
      }
    });

    it('withdraws previous tokens when adding different ones', async () => {
      let token2 = await ERC20Mock.at(
        await deployAndInitializeERC20Mock(admin, 'DAI Token 2', 'DAI2')
      );
      await settings.setSupportedPaymentTokens(token2.address, true, {
        from: admin,
      });
      for (const user of [sender1, sender2]) {
        // set approvals
        await token2.approve(payments.address, balance, {
          from: user,
        });
        await daiToken.approve(payments.address, balance, {
          from: user,
        });

        // transfer tokens
        await daiToken.transfer(user, balance, {
          from: admin,
        });
        await token2.transfer(user, balance, {
          from: admin,
        });

        // transfer first tokens
        await payments.addTokens(token2.address, balance, {
          from: user,
        });

        // transfer second tokens
        let receipt = await payments.addTokens(daiToken.address, balance, {
          from: user,
        });

        expectEvent(receipt, 'BalanceUpdated', {
          token: token2.address,
          account: user,
        });
        expectEvent(receipt, 'BalanceUpdated', {
          token: daiToken.address,
          account: user,
        });
        expect(await payments.balanceOf(user)).to.bignumber.equal(balance);
        expect(await payments.selectedTokens(user)).to.equal(daiToken.address);
      }
    });

    it('adds tokens to the current balance', async () => {
      for (const user of [sender1, sender2]) {
        await daiToken.approve(payments.address, balance.mul(new BN(2)), {
          from: user,
        });
        await daiToken.transfer(user, balance.mul(new BN(2)), {
          from: admin,
        });

        let receipt = await payments.addTokens(daiToken.address, balance, {
          from: user,
        });

        expectEvent(receipt, 'BalanceUpdated', {
          token: daiToken.address,
          account: user,
        });
        expect(await payments.balanceOf(user)).to.bignumber.equal(balance);

        receipt = await payments.addTokens(daiToken.address, balance, {
          from: user,
        });
        expectEvent(receipt, 'BalanceUpdated', {
          token: daiToken.address,
          account: user,
        });
        expect(await payments.balanceOf(user)).to.bignumber.equal(
          balance.mul(new BN(2))
        );
      }
    });
  });

  describe('withdraw tokens', () => {
    beforeEach(async () => {
      for (const user of [sender1, sender2]) {
        await daiToken.approve(payments.address, balance, {
          from: user,
        });
        await daiToken.transfer(user, balance, {
          from: admin,
        });
        await payments.addTokens(daiToken.address, balance, {
          from: user,
        });
      }
    });

    it('fails to withdraw zero amount', async () => {
      await expectRevert(
        payments.withdrawTokens('0', {
          from: anyone,
        }),
        'Payments: invalid amount'
      );
    });

    it('fails to withdraw with insufficient balance', async () => {
      await expectRevert(
        payments.withdrawTokens(balance, {
          from: anyone,
        }),
        'Payments: insufficient tokens balance'
      );
    });

    it('withdraws tokens for different users', async () => {
      for (const user of [sender1, sender2]) {
        let receipt = await payments.withdrawTokens(balance, {
          from: user,
        });

        expectEvent(receipt, 'BalanceUpdated', {
          token: daiToken.address,
          account: user,
        });
        expect(await payments.balanceOf(user)).to.bignumber.equal(new BN(0));
      }
    });
  });

  describe('execute payments', () => {
    let userPayments;

    beforeEach(async () => {
      for (const user of [sender1, sender2]) {
        await daiToken.approve(payments.address, balance, {
          from: user,
        });
        await daiToken.transfer(user, balance, {
          from: admin,
        });
        await payments.addTokens(daiToken.address, balance, {
          from: user,
        });
        let billDate = await time.latest();
        userPayments = [
          {
            billDate: billDate.toString(),
            sender: sender1,
            amount: balance.toString(),
          },
          {
            billDate: billDate.toString(),
            sender: sender2,
            amount: balance.toString(),
          },
        ];
      }
    });

    it('only manager can execute payments', async () => {
      await expectRevert(
        payments.executePayments(userPayments, {
          from: anyone,
        }),
        'Payments: permission denied'
      );
    });

    it('fails to execute payments with insufficient balance', async () => {
      await payments.withdrawTokens(balance, {
        from: sender1,
      });
      await expectRevert(
        payments.executePayments(userPayments, {
          from: manager,
        }),
        'Payments: insufficient balance'
      );
    });

    it('manager can execute payments', async () => {
      let receipt = await payments.executePayments(userPayments, {
        from: manager,
      });
      for (const userPayment of userPayments) {
        expectEvent(receipt, 'PaymentSent', {
          billDate: userPayment.billDate,
          sender: userPayment.sender,
          amount: userPayment.amount,
        });
        expect(await payments.balanceOf(userPayment.sender)).to.bignumber.equal(
          new BN(0)
        );
      }
      expect(
        await daiToken.balanceOf(initialSettings.maintainer)
      ).to.bignumber.equal(balance.mul(new BN(2)));
    });
  });
});
