const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
} = require('../../deployments/access');

const Operators = artifacts.require('Operators');

contract('Operators', ([_, ...accounts]) => {
  let admins, operators;
  let [admin, operator, anotherOperator, anyone] = accounts;

  before(async () => {
    admins = await deployAndInitializeAdmins(admin);
  });

  beforeEach(async () => {
    operators = await Operators.at(await deployAndInitializeOperators(admins));
  });

  describe('assigning', () => {
    it('admin can assign operator role to another account', async () => {
      const receipt = await operators.addOperator(operator, { from: admin });
      expectEvent(receipt, 'OperatorAdded', {
        account: operator,
      });
      expect(await operators.isOperator(operator)).equal(true);
      expect(await operators.isOperator(admin)).equal(false);
      expect(await operators.isOperator(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        operators.addOperator(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned operator role multiple times', async () => {
      await operators.addOperator(operator, { from: admin });
      expect(await operators.isOperator(operator)).equal(true);
      await expectRevert(
        operators.addOperator(operator, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('others cannot assign operator role to an account', async () => {
      await expectRevert(
        operators.addOperator(operator, { from: anyone }),
        'Operators: only admin users can assign operators'
      );
      expect(await operators.isOperator(operator)).equal(false);
      expect(await operators.isOperator(anyone)).equal(false);
    });

    it('operators cannot assign operator role to others', async () => {
      await operators.addOperator(operator, { from: admin });
      await expectRevert(
        operators.addOperator(anotherOperator, { from: operator }),
        'Operators: only admin users can assign operators'
      );
      expect(await operators.isOperator(operator)).equal(true);
      expect(await operators.isOperator(anotherOperator)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await operators.addOperator(operator, { from: admin });
      await operators.addOperator(anotherOperator, { from: admin });
    });

    it('anyone cannot remove operators', async () => {
      await expectRevert(
        operators.removeOperator(operator, { from: anyone }),
        'Operators: only admin users can remove operators'
      );
      expect(await operators.isOperator(operator)).equal(true);
      expect(await operators.isOperator(anotherOperator)).equal(true);
    });

    it('operator cannot remove other operators', async () => {
      await expectRevert(
        operators.removeOperator(anotherOperator, { from: operator }),
        'Operators: only admin users can remove operators'
      );
      expect(await operators.isOperator(operator)).equal(true);
      expect(await operators.isOperator(anotherOperator)).equal(true);
    });

    it('cannot remove account without operator role', async () => {
      await expectRevert(
        operators.removeOperator(anyone, { from: admin }),
        'Roles: account does not have role'
      );
      expect(await operators.isOperator(operator)).equal(true);
      expect(await operators.isOperator(anotherOperator)).equal(true);
    });

    it('admins can remove operators', async () => {
      const receipt = await operators.removeOperator(operator, {
        from: admin,
      });
      expectEvent(receipt, 'OperatorRemoved', {
        account: operator,
      });
      expect(await operators.isOperator(operator)).equal(false);
      expect(await operators.isOperator(anotherOperator)).equal(true);
    });
  });
});
