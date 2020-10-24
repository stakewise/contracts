const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
} = require('../deployments/access');
const {
  initialSettings,
  deployAndInitializeSettings,
} = require('../deployments/settings');
const {
  deployValidators,
  initializeValidators,
} = require('../deployments/validators');

const Validators = artifacts.require('Validators');
const Settings = artifacts.require('Settings');

const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';

contract(
  'Validators',
  ([_, poolContractAddress, solosContractAddress, admin, anyone]) => {
    let validators, settings;

    beforeEach(async () => {
      let adminsContractAddress = await deployAndInitializeAdmins(admin);
      let operatorsContractAddress = await deployAndInitializeOperators(
        adminsContractAddress
      );
      settings = await Settings.at(
        await deployAndInitializeSettings(
          adminsContractAddress,
          operatorsContractAddress
        )
      );

      validators = await Validators.at(await deployValidators());
      await initializeValidators(
        validators.address,
        poolContractAddress,
        solosContractAddress,
        settings.address
      );
    });

    it('only collectors can register validators', async () => {
      await expectRevert(
        validators.register(
          web3.utils.fromAscii('\x11'.repeat(48)),
          web3.utils.soliditySha3('collector', 1),
          {
            from: anyone,
          }
        ),
        'Validators: permission denied'
      );

      let entityId = web3.utils.soliditySha3('collector', 1);
      let receipt = await validators.register(publicKey, entityId, {
        from: solosContractAddress,
      });
      expectEvent(receipt, 'ValidatorRegistered', {
        entityId,
        pubKey: publicKey,
        price: initialSettings.validatorPrice,
      });
    });

    it('fails to register validator with paused contract', async () => {
      await settings.setPausedContracts(validators.address, true, {
        from: admin,
      });
      await expectRevert(
        validators.register(
          web3.utils.fromAscii('\x11'.repeat(48)),
          web3.utils.soliditySha3('collector', 1),
          {
            from: solosContractAddress,
          }
        ),
        'Validators: contract is paused'
      );
    });
  }
);
