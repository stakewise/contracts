const { expect } = require('chai');
const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const {
  deployAdminsProxy,
  deployOperatorsProxy,
  deployManagersProxy,
} = require('../deployments/access');
const {
  deploySettingsProxy,
  initialSettings,
} = require('../deployments/settings');
const { removeNetworkFile, checkPayments } = require('./utils');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../deployments/common');
const { deployDAI } = require('../deployments/tokens');

const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Payments = artifacts.require('Payments');
const Settings = artifacts.require('Settings');

let validators = [
  [
    '0x24907100b5f89c61eeb826e32bd472f6a0914b51eab10b697cd1b6ddf859563a',
    new BN(initialSettings.validatorPrice),
  ],
  [
    '0x0ac4c6d4e203a4fc81d40e562b6b43e5efe93b4ba7f410f1a60aef1b77b882c9',
    new BN(
      Math.floor(Math.random() * (38051750380510 - 1 + 1)) + 38051750380510
    ),
  ],
  [
    '0x2584145efd853fdb0f0f6c8b6ee227d49c98937e42b30d068e9c3290a52d07b1',
    new BN(
      Math.floor(Math.random() * (38051750380510 - 1 + 1)) + 38051750380510
    ),
  ],
];

contract('Payments', ([_, ...accounts]) => {
  let networkConfig,
    dai,
    payments,
    settings,
    operatorsProxy,
    managersProxy,
    settingsProxy;
  let [
    admin,
    operator,
    manager,
    refundRecipient,
    solos,
    groups,
    anyone,
  ] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });

    // deploy admins proxy
    let adminsProxy = await deployAdminsProxy({
      networkConfig,
      initialAdmin: admin,
    });

    // deploy and configure operator
    operatorsProxy = await deployOperatorsProxy({ networkConfig, adminsProxy });
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });

    // deploy and configure manager
    managersProxy = await deployManagersProxy({ networkConfig, adminsProxy });
    let managers = await Managers.at(managersProxy);
    await managers.addManager(manager, { from: admin });

    // deploy settings
    settingsProxy = await deploySettingsProxy({
      networkConfig,
      adminsProxy,
      operatorsProxy,
    });
    settings = await Settings.at(settingsProxy);
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    dai = await deployDAI(admin, { from: admin });
    payments = await Payments.new();
    await payments.initialize(
      operatorsProxy,
      managersProxy,
      settingsProxy,
      dai.address,
      solos,
      groups
    );
  });

  it('only collector can set refund recipient', async () => {
    let users = [admin, operator, manager, anyone];
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        payments.setRefundRecipient(anyone, {
          from: users[i],
        }),
        'Payments: permission denied'
      );
    }
    await payments.setRefundRecipient(anyone, {
      from: groups,
    });
    await payments.setRefundRecipient(anyone, {
      from: solos,
    });
  });

  describe('start metering', () => {
    it('only collector can start metering new validator', async () => {
      let users = [admin, operator, manager, anyone];
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          payments.startMeteringValidator(validators[0][0], {
            from: users[i],
          }),
          'Payments: permission denied'
        );
      }
      await payments.startMeteringValidator(validators[0][0], {
        from: solos,
      });

      await payments.startMeteringValidator(validators[1][0], {
        from: groups,
      });
    });

    it('updates total price for every added validator', async () => {
      let totalPrice = new BN(0);
      for (const [validatorId, validatorPrice] of validators) {
        await settings.setValidatorPrice(validatorPrice, {
          from: admin,
        });
        await payments.startMeteringValidator(validatorId, {
          from: solos,
        });
        totalPrice = totalPrice.add(validatorPrice);
        await checkPayments(payments.address, totalPrice);
      }
    });
  });

  describe('stop metering', () => {
    beforeEach(async () => {
      for (const [validatorId, validatorPrice] of validators) {
        await settings.setValidatorPrice(validatorPrice, {
          from: admin,
        });
        await payments.startMeteringValidator(validatorId, {
          from: solos,
        });
      }
    });

    it('only operator can stop metering validator', async () => {
      let users = [admin, solos, groups, manager, anyone];
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          payments.stopMeteringValidator(validators[0][0], {
            from: users[i],
          }),
          'Payments: permission denied'
        );
      }

      await payments.stopMeteringValidator(validators[0][0], {
        from: operator,
      });
    });

    it('cannot stop metering validator twice', async () => {
      await payments.stopMeteringValidator(validators[0][0], {
        from: operator,
      });

      await expectRevert(
        payments.stopMeteringValidator(validators[0][0], {
          from: operator,
        }),
        'Payments: metering is already stopped for the validator'
      );
    });

    it('updates total price for every removed validator', async () => {
      let totalPrice = await payments.getTotalPrice();
      for (const [validatorId, validatorPrice] of validators) {
        await payments.stopMeteringValidator(validatorId, {
          from: operator,
        });
        totalPrice = totalPrice.sub(validatorPrice);
        await checkPayments(payments.address, totalPrice);
      }
    });
  });

  it('calculates total bill correctly', async () => {
    let totalPrice = new BN(0);
    let totalBill = new BN(0);
    let lastMeteringTimestamp = new BN(0);
    let checkedTimestamp;

    // test adding new validators
    for (const [validatorId, validatorPrice] of validators) {
      // start metering new validator
      await settings.setValidatorPrice(validatorPrice, {
        from: admin,
      });
      let { receipt } = await payments.startMeteringValidator(validatorId, {
        from: solos,
      });
      lastMeteringTimestamp = new BN(
        (await web3.eth.getBlock(receipt.blockNumber)).timestamp
      );

      if (checkedTimestamp) {
        // bill leap seconds
        totalBill = totalBill.add(
          totalPrice.mul(lastMeteringTimestamp.sub(checkedTimestamp))
        );
      }

      totalPrice = totalPrice.add(validatorPrice);

      // generate random staking duration
      let duration = new BN(
        Math.floor(Math.random() * (10000000 - 1 + 1)) + 10000000
      );

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(duration));

      totalBill = totalBill.add(totalPrice.mul(new BN(duration)));
      checkedTimestamp = lastMeteringTimestamp.add(duration);
      expect(
        await payments.getTotalBill(new BN(checkedTimestamp))
      ).to.bignumber.equal(totalBill);
    }

    // test removing validators
    for (const [validatorId, validatorPrice] of validators) {
      // stop metering validator
      let { receipt } = await payments.stopMeteringValidator(validatorId, {
        from: operator,
      });

      lastMeteringTimestamp = new BN(
        (await web3.eth.getBlock(receipt.blockNumber)).timestamp
      );

      if (checkedTimestamp) {
        // bill leap seconds
        totalBill = totalBill.add(
          totalPrice.mul(lastMeteringTimestamp.sub(checkedTimestamp))
        );
      }

      totalPrice = totalPrice.sub(validatorPrice);

      // generate random staking duration
      let duration = new BN(
        Math.floor(Math.random() * (10000000 - 1 + 1)) + 10000000
      );

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(duration));

      totalBill = totalBill.add(totalPrice.mul(duration));
      checkedTimestamp = lastMeteringTimestamp.add(duration);
      expect(
        await payments.getTotalBill(new BN(checkedTimestamp))
      ).to.bignumber.equal(totalBill);
    }
  });

  describe('payment withdrawal', () => {
    let totalBill;

    beforeEach(async () => {
      for (const [validatorId, validatorPrice] of validators) {
        await settings.setValidatorPrice(validatorPrice, {
          from: admin,
        });
        await payments.startMeteringValidator(validatorId, {
          from: solos,
        });
      }

      // generate random staking duration
      let duration = new BN(
        Math.floor(Math.random() * (10000000 - 1 + 1)) + 10000000
      );

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(duration));

      totalBill = await payments.getTotalBill(await time.latest());
    });

    it('only manager can withdraw payment', async () => {
      await dai.transfer(payments.address, totalBill, {
        from: admin,
      });
      let users = [admin, solos, anyone];
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          payments.withdraw(totalBill, {
            from: users[i],
          }),
          'Payments: permission denied'
        );
      }

      await payments.withdraw(totalBill, {
        from: manager,
      });
    });

    it('cannot withdraw more than billed', async () => {
      await expectRevert(
        payments.withdraw(totalBill.mul(new BN(2)), {
          from: manager,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('cannot withdraw with not enough balance', async () => {
      await expectRevert(
        payments.withdraw(totalBill, {
          from: manager,
        }),
        'SafeERC20: low-level call failed'
      );
    });

    it('cannot withdraw twice', async () => {
      await dai.transfer(payments.address, totalBill, {
        from: admin,
      });
      await payments.withdraw(totalBill, {
        from: manager,
      });
      expect(
        await dai.balanceOf(initialSettings.maintainer)
      ).to.bignumber.equal(totalBill);

      await expectRevert(
        payments.withdraw(totalBill, {
          from: manager,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('can withdraw partial amounts', async () => {
      await dai.transfer(payments.address, totalBill, {
        from: admin,
      });

      // withdraw first part
      await payments.withdraw(totalBill.sub(new BN(1)), {
        from: manager,
      });
      expect(
        await dai.balanceOf(initialSettings.maintainer)
      ).to.bignumber.equal(totalBill.sub(new BN(1)));

      // withdraw second part
      await payments.withdraw(new BN(1), {
        from: manager,
      });
      expect(
        await dai.balanceOf(initialSettings.maintainer)
      ).to.bignumber.equal(totalBill);

      // check third withdrawal is not possible
      await expectRevert(
        payments.withdraw(totalBill, {
          from: manager,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('can withdraw full amount', async () => {
      await dai.transfer(payments.address, totalBill, {
        from: admin,
      });
      await payments.withdraw(totalBill, {
        from: manager,
      });
      expect(
        await dai.balanceOf(initialSettings.maintainer)
      ).to.bignumber.equal(totalBill);
    });
  });

  describe('claim refund', () => {
    let totalBill, totalBalance, refundAmount;

    beforeEach(async () => {
      for (const [validatorId, validatorPrice] of validators) {
        await settings.setValidatorPrice(validatorPrice, {
          from: admin,
        });
        await payments.startMeteringValidator(validatorId, {
          from: solos,
        });
      }

      // generate random staking duration
      let duration = new BN(
        Math.floor(Math.random() * (10000000 - 1 + 1)) + 10000000
      );

      // wait until staking duration has passed
      await time.increase(time.duration.seconds(duration));

      totalBill = await payments.getTotalBill(await time.latest());
      totalBalance = totalBill.mul(new BN(3));
      refundAmount = totalBalance.sub(totalBill.mul(new BN(2)));
      await payments.setRefundRecipient(refundRecipient, { from: solos });
    });

    it('only refund recipient can claim refund', async () => {
      await dai.transfer(payments.address, totalBalance, {
        from: admin,
      });
      let users = [admin, solos, groups, manager, anyone];
      for (let i = 0; i < users.length; i++) {
        await expectRevert(
          payments.refund(refundAmount, {
            from: users[i],
          }),
          'Payments: permission denied'
        );
      }
    });

    it('cannot refund more than available', async () => {
      await dai.transfer(payments.address, totalBalance, {
        from: admin,
      });
      await expectRevert(
        payments.refund(totalBalance, {
          from: refundRecipient,
        }),
        'Payments: insufficient balance'
      );
    });

    it('can refund partial amounts', async () => {
      await dai.transfer(payments.address, totalBalance, {
        from: admin,
      });

      // refund first part
      await payments.refund(refundAmount.sub(new BN(1)), {
        from: refundRecipient,
      });
      expect(await dai.balanceOf(refundRecipient)).to.bignumber.equal(
        refundAmount.sub(new BN(1))
      );

      // refund second part
      await payments.refund(new BN(1), {
        from: refundRecipient,
      });
      expect(await dai.balanceOf(refundRecipient)).to.bignumber.equal(
        refundAmount
      );

      // check third refund is not possible
      await expectRevert(
        payments.refund(totalBalance, {
          from: refundRecipient,
        }),
        'Payments: insufficient balance'
      );
    });

    it('can refund full amount', async () => {
      await dai.transfer(payments.address, totalBalance, {
        from: admin,
      });
      await payments.refund(refundAmount, {
        from: refundRecipient,
      });
      expect(await dai.balanceOf(refundRecipient)).to.bignumber.equal(
        refundAmount
      );
    });
  });
});
