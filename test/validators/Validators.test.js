const {
  expectRevert,
  expectEvent,
  constants,
  BN,
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const { deployVRC } = require('../../deployments/vrc');
const {
  validatorRegistrationArgs,
} = require('../common/validatorRegistrationArgs');
const {
  removeNetworkFile,
  registerValidator,
  getEntityId,
} = require('../common/utils');

const Operators = artifacts.require('Operators');
const Managers = artifacts.require('Managers');
const Validators = artifacts.require('Validators');
const Solos = artifacts.require('Solos');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);
const withdrawalPublicKey =
  '0x940fc4559b53d4566d9693c23ec6b80d7f663fddf9b1c06490cc64602dae1fa6abf2086fdf2b0da703e0e392e0d0528c';
const signature =
  '0xa763fd95e10a3f54e480174a5df246c4dc447605219d13d971ff02dbbbd3fbba8197b65c4738449ad4dec10c14f5f3b51686c3d75bf58eee6e296a6b8254e7073dc4a73b10256bc6d58c8e24d8d462bec6a9f4c224eae703bf6baf5047ed206b';
const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';
const depositDataRoot =
  '0x6da4c3b16280ff263d7b32cfcd039c6cf72a3db0d8ef3651370e0aba5277ce2f';

contract('Validators', ([_, ...accounts]) => {
  let networkConfig, validators, solos, vrc, settings, validatorId;
  let [admin, operator, manager, sender, anyone] = accounts;
  let users = [admin, operator, anyone];

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address,
    });
    validators = await Validators.at(proxies.validators);
    solos = await Solos.at(proxies.solos);
    settings = await Settings.at(proxies.settings);

    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let managers = await Managers.at(proxies.managers);
    await managers.addManager(manager, { from: admin });

    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender,
      recipient: sender,
    });
  });

  it('only collectors can register validators', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        validators.register(
          web3.utils.fromAscii('\x11'.repeat(48)),
          web3.utils.soliditySha3('collector', 1),
          constants.ZERO_BYTES32,
          initialSettings.validatorDepositAmount,
          initialSettings.maintainerFee,
          {
            from: users[i],
          }
        ),
        'Permission denied.'
      );
    }
  });

  it('only collectors can update validators', async () => {
    for (let i = 0; i < users.length; i++) {
      await expectRevert(
        validators.update(
          web3.utils.soliditySha3(validatorRegistrationArgs[0].pubKey),
          web3.utils.soliditySha3('collector', 1),
          initialSettings.maintainerFee,
          {
            from: users[i],
          }
        ),
        'Permission denied.'
      );
    }
  });

  describe('assigning wallet', () => {
    it('user without manager role cannot assign wallets', async () => {
      for (const user of [admin, operator, sender]) {
        await expectRevert(
          validators.assignWallet(validatorId, {
            from: user,
          }),
          'Permission denied.'
        );
      }
    });

    it('cannot assign wallet to the same validator more than once', async () => {
      await validators.assignWallet(validatorId, {
        from: manager,
      });

      await expectRevert(
        validators.assignWallet(validatorId, {
          from: manager,
        }),
        'Validator has already wallet assigned.'
      );
    });

    it('user cannot assign wallet to private entity without wallet manager role', async () => {
      await solos.addPrivateDeposit(withdrawalPublicKey, {
        from: sender,
        value: validatorDepositAmount,
      });

      // register validator
      await solos.registerValidator(
        publicKey,
        signature,
        depositDataRoot,
        getEntityId(solos.address, new BN(1)),
        {
          from: operator,
        }
      );
      let validatorId = web3.utils.soliditySha3(publicKey);

      await expectRevert(
        validators.assignWallet(validatorId, {
          from: manager,
        }),
        'Permission denied.'
      );
    });

    it('cannot assign wallet to the non existing validator', async () => {
      await expectRevert(
        validators.assignWallet(web3.utils.soliditySha3('invalidValidator'), {
          from: manager,
        }),
        'Invalid validator ID.'
      );
    });

    it('user with wallet manager role can assign wallet to the private entity', async () => {
      await solos.addPrivateDeposit(withdrawalPublicKey, {
        from: sender,
        value: validatorDepositAmount,
      });

      // register validator
      await solos.registerValidator(
        publicKey,
        signature,
        depositDataRoot,
        getEntityId(solos.address, new BN(1)),
        {
          from: operator,
        }
      );
      let validatorId = web3.utils.soliditySha3(publicKey);

      const receipt = await validators.assignWallet(validatorId, {
        from: sender,
      });
      const wallet = receipt.logs[0].args.wallet;

      // wallet assigned to validator
      expectEvent(receipt, 'WalletAssigned', {
        wallet,
        validatorId,
      });
      expect((await validators.validators(validatorId)).wallet).equal(wallet);
    });

    it('user with manager role can assign wallet', async () => {
      const receipt = await validators.assignWallet(validatorId, {
        from: manager,
      });
      const wallet = receipt.logs[0].args.wallet;

      // wallet assigned to validator
      expectEvent(receipt, 'WalletAssigned', {
        wallet,
        validatorId,
      });
      expect((await validators.validators(validatorId)).wallet).equal(wallet);
    });

    it('fails to assign wallet if validators contract paused', async () => {
      await settings.setContractPaused(validators.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(validators.address)).equal(true);

      await expectRevert(
        validators.assignWallet(validatorId, {
          from: manager,
        }),
        'Wallets assignment is currently disabled.'
      );
    });
  });
});
