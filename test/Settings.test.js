const { expect } = require('chai');
const {
  BN,
  ether,
  expectEvent,
  expectRevert
} = require('openzeppelin-test-helpers');
const { deployAdminsProxy } = require('../deployments/access');
const {
  deploySettingsProxy,
  initialSettings
} = require('../deployments/settings');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { removeNetworkFile } = require('./utils');

const newValues = [
  ['userDepositMinUnit', ether('0.002')],
  ['validatorDepositAmount', ether('30')],
  ['withdrawalCredentials', web3.utils.asciiToHex('\x02'.repeat(32))],
  ['maintainer', '0xF4904844B4aF87f4036E77Ad1697bEcf703c8439'],
  ['maintainerFee', new BN(100)]
];

function getSetMethod(setting) {
  return `set${setting.charAt(0).toUpperCase() + setting.slice(1)}`;
}

function assertEqual(value1, value2) {
  if (BN.isBN(value1)) {
    expect(value1).to.be.bignumber.equal(value2);
  } else {
    expect(value1).equal(value2);
  }
}

const Settings = artifacts.require('Settings');

contract('Settings', ([_, admin, anyone]) => {
  let adminsProxy;
  let networkConfig;
  let settings;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    adminsProxy = await deployAdminsProxy({
      networkConfig,
      initialAdmin: admin
    });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    settings = await Settings.at(
      await deploySettingsProxy({ networkConfig, adminsProxy })
    );
  });

  it('sets parameters on initialization', async () => {
    for (const [setting, initialValue] of Object.entries(initialSettings)) {
      assertEqual(await settings[setting](), initialValue);
    }
  });

  it('admins can change settings', async () => {
    for (const [setting, newValue] of newValues) {
      await assertEqual(await settings[setting](), initialSettings[setting]);
      const setMethod = getSetMethod(setting);
      const { logs } = await settings[setMethod](newValue, {
        from: admin
      });
      expectEvent.inLogs(logs, 'SettingChanged', {
        settingName: web3.utils.fromAscii(setting).padEnd(66, '0')
      });
      assertEqual(await settings[setting](), newValue);
    }
  });

  it('others cannot change settings', async () => {
    for (const [setting, newValue] of newValues) {
      assertEqual(await settings[setting](), initialSettings[setting]);
      const setMethod = getSetMethod(setting);
      await expectRevert(
        settings[setMethod](newValue, {
          from: anyone
        }),
        'Only admin users can change this parameter.'
      );
      assertEqual(await settings[setting](), initialSettings[setting]);
    }
  });

  it('checks that pool fee is less than 100%', async () => {
    await expectRevert(
      settings.setMaintainerFee(new BN(10000), {
        from: admin
      }),
      'Invalid value.'
    );
    assertEqual(await settings.maintainerFee(), initialSettings.maintainerFee);
  });
});
