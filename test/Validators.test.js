const {
  expectRevert,
  expectEvent,
  ether,
  balance,
  send,
} = require('@openzeppelin/test-helpers');
const { upgradeContracts } = require('../deployments');
const { validatorParams } = require('./pool/validatorParams');
const { contractSettings, contracts } = require('../deployments/settings');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('./utils');

const Pool = artifacts.require('Pool');
const Validators = artifacts.require('Validators');

const validatorId = web3.utils.soliditySha3(
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7'
);
const validatorDeposit = ether('32');

contract('Validators', ([operator, anotherOperator, anyone]) => {
  const admin = contractSettings.admin;
  let pool, validators;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    await upgradeContracts();
    pool = await Pool.at(contracts.pool);
    validators = await Validators.at(contracts.validators);
    await validators.addOperator(operator, { from: admin });
  });

  afterEach(async () => resetFork());

  it('only collectors can register validators', async () => {
    await expectRevert(
      validators.register(validatorId, {
        from: anyone,
      }),
      'Validators: access denied'
    );
  });

  it('fails to register validator with paused contract', async () => {
    await validators.pause({ from: admin });
    expect(await validators.paused()).equal(true);
    let poolBalance = await balance.current(pool.address);
    let depositAmount = validatorDeposit.sub(poolBalance);
    await pool.addDeposit({
      from: anyone,
      value: depositAmount,
    });

    await expectRevert(
      pool.registerValidator(validatorParams[0], {
        from: operator,
      }),
      'Pausable: paused'
    );
  });

  describe('assigning operators', () => {
    it('admin can assign operator role to another account', async () => {
      const receipt = await validators.addOperator(anotherOperator, {
        from: admin,
      });
      expectEvent(receipt, 'RoleGranted', {
        role: await validators.OPERATOR_ROLE(),
        account: anotherOperator,
        sender: admin,
      });
      expect(await validators.isOperator(operator)).equal(true);
      expect(await validators.isOperator(anotherOperator)).equal(true);
      expect(await validators.isOperator(admin)).equal(false);
      expect(await validators.isOperator(anyone)).equal(false);
    });

    it('others cannot assign operator role to an account', async () => {
      await expectRevert(
        validators.addOperator(anotherOperator, { from: anyone }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await validators.isOperator(operator)).equal(true);
      expect(await validators.isOperator(anotherOperator)).equal(false);
      expect(await validators.isOperator(anyone)).equal(false);
    });

    it('operators cannot assign operator role to others', async () => {
      await validators.addOperator(operator, { from: admin });
      await expectRevert(
        validators.addOperator(anotherOperator, { from: operator }),
        'AccessControl: sender must be an admin to grant'
      );
      expect(await validators.isOperator(operator)).equal(true);
      expect(await validators.isOperator(anotherOperator)).equal(false);
    });
  });

  describe('removing operators', () => {
    beforeEach(async () => {
      await validators.addOperator(operator, { from: admin });
      await validators.addOperator(anotherOperator, { from: admin });
    });

    it('anyone cannot remove operators', async () => {
      await expectRevert(
        validators.removeOperator(operator, { from: anyone }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await validators.isOperator(operator)).equal(true);
      expect(await validators.isOperator(anotherOperator)).equal(true);
    });

    it('operator cannot remove other operators', async () => {
      await expectRevert(
        validators.removeOperator(anotherOperator, { from: operator }),
        'AccessControl: sender must be an admin to revoke'
      );
      expect(await validators.isOperator(operator)).equal(true);
      expect(await validators.isOperator(anotherOperator)).equal(true);
    });

    it('admins can remove operators', async () => {
      const receipt = await validators.removeOperator(operator, {
        from: admin,
      });
      expectEvent(receipt, 'RoleRevoked', {
        role: await validators.OPERATOR_ROLE(),
        account: operator,
        sender: admin,
      });
      expect(await validators.isOperator(operator)).equal(false);
      expect(await validators.isOperator(anotherOperator)).equal(true);
    });
  });
});
