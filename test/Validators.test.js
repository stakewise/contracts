const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const {
  deployValidators,
  initializeValidators,
} = require('../deployments/validators');

const Validators = artifacts.require('Validators');

const validatorId = web3.utils.soliditySha3(
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7'
);

contract(
  'Validators',
  ([
    _,
    poolContractAddress,
    solosContractAddress,
    admin,
    operator,
    anotherOperator,
    anyone,
  ]) => {
    let validators;

    beforeEach(async () => {
      validators = await Validators.at(await deployValidators());
      await initializeValidators(
        validators.address,
        admin,
        poolContractAddress,
        solosContractAddress
      );
    });

    it('only collectors can register validators', async () => {
      await expectRevert(
        validators.register(validatorId, {
          from: anyone,
        }),
        'Validators: access denied'
      );

      await validators.register(validatorId, {
        from: solosContractAddress,
      });
    });

    it('fails to register validator with paused contract', async () => {
      await validators.pause({ from: admin });
      expect(await validators.paused()).equal(true);
      await expectRevert(
        validators.register(validatorId, {
          from: solosContractAddress,
        }),
        'Pausable: paused'
      );
    });

    describe('assigning operators', () => {
      it('admin can assign operator role to another account', async () => {
        const receipt = await validators.addOperator(operator, { from: admin });
        expectEvent(receipt, 'RoleGranted', {
          role: await validators.OPERATOR_ROLE(),
          account: operator,
          sender: admin,
        });
        expect(await validators.isOperator(operator)).equal(true);
        expect(await validators.isOperator(admin)).equal(false);
        expect(await validators.isOperator(anyone)).equal(false);
      });

      it('others cannot assign operator role to an account', async () => {
        await expectRevert(
          validators.addOperator(operator, { from: anyone }),
          'AccessControl: sender must be an admin to grant'
        );
        expect(await validators.isOperator(operator)).equal(false);
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
  }
);
