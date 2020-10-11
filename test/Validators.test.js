const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../deployments/common');
const {
  deployAdminsProxy,
  deployOperatorsProxy,
} = require('../deployments/access');
const {
  initialSettings,
  deploySettingsProxy,
} = require('../deployments/settings');
const { deployValidatorsProxy } = require('../deployments/validators');
const { removeNetworkFile } = require('./utils');

const Validators = artifacts.require('Validators');
const Settings = artifacts.require('Settings');

const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';

contract('Validators', ([_, pool, solos, admin, anyone]) => {
  let networkConfig, validators, settings;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let adminsProxy = await deployAdminsProxy({
      networkConfig,
      initialAdmin: admin,
    });

    let operatorsProxy = await deployOperatorsProxy({
      networkConfig,
      adminsProxy,
    });

    let settingsProxy = await deploySettingsProxy({
      networkConfig,
      adminsProxy,
      operatorsProxy,
    });

    validators = await Validators.at(
      await deployValidatorsProxy({
        networkConfig,
        poolProxy: pool,
        solosProxy: solos,
        settingsProxy,
      })
    );
    settings = await Settings.at(settingsProxy);
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
      from: solos,
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
          from: solos,
        }
      ),
      'Validators: contract is disabled'
    );
  });
});
