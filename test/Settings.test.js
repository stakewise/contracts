const { expect } = require('chai');
const {
  BN,
  ether,
  expectEvent,
  expectRevert
} = require('@openzeppelin/test-helpers');
const {
  deployAdminsProxy,
  deployOperatorsProxy
} = require('../deployments/access');
const {
  deploySettingsProxy,
  initialSettings
} = require('../deployments/settings');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../deployments/common');
const { removeNetworkFile } = require('./common/utils');

const newValues = [
  ['userDepositMinUnit', ether('0.002')],
  ['validatorDepositAmount', ether('30')],
  ['withdrawalCredentials', web3.utils.asciiToHex('\x02'.repeat(32))],
  ['maintainer', '0xF4904844B4aF87f4036E77Ad1697bEcf703c8439'],
  ['maintainerFee', new BN(100)],
  ['minStakingDuration', new BN(1209600)],
  ['stakingDuration', new BN(31556952)],
  ['collectorPaused', true]
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
const Operators = artifacts.require('Operators');

contract('Settings', ([_, admin, operator, collector, anyone]) => {
  let adminsProxy;
  let operatorsProxy;
  let networkConfig;
  let settings;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    adminsProxy = await deployAdminsProxy({
      networkConfig,
      initialAdmin: admin
    });
    operatorsProxy = await deployOperatorsProxy({
      networkConfig,
      adminsProxy
    });
    let operators = await Operators.at(operatorsProxy);
    await operators.addOperator(operator, { from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    settings = await Settings.at(
      await deploySettingsProxy({ networkConfig, adminsProxy, operatorsProxy })
    );
  });

  it('sets parameters on initialization', async () => {
    for (const [setting, initialValue] of Object.entries(initialSettings)) {
      assertEqual(await settings[setting](), initialValue);
    }
  });

  it('admins can change settings', async () => {
    for (const [setting, newValue] of newValues) {
      if (setting === 'stakingDuration') {
        expect(
          await settings.stakingDurations(collector)
        ).to.be.bignumber.equal(new BN(0));
        const receipt = await settings.setStakingDuration(collector, newValue, {
          from: admin
        });
        expectEvent(receipt, 'SettingChanged', {
          settingName: web3.utils.fromAscii('stakingDurations').padEnd(66, '0')
        });
        expect(
          await settings.stakingDurations(collector)
        ).to.be.bignumber.equal(newValue);
      } else if (setting === 'collectorPaused') {
        expect(await settings.pausedCollectors(collector)).equal(false);
        const receipt = await settings.setCollectorPaused(collector, newValue, {
          from: admin
        });
        expectEvent(receipt, 'SettingChanged', {
          settingName: web3.utils.fromAscii('pausedCollectors').padEnd(66, '0')
        });
        expect(await settings.pausedCollectors(collector)).equal(newValue);
      } else {
        await assertEqual(await settings[setting](), initialSettings[setting]);
        const setMethod = getSetMethod(setting);
        const receipt = await settings[setMethod](newValue, {
          from: admin
        });
        expectEvent(receipt, 'SettingChanged', {
          settingName: web3.utils.fromAscii(setting).padEnd(66, '0')
        });
        assertEqual(await settings[setting](), newValue);
      }
    }
  });

  it('others cannot change settings', async () => {
    for (const [setting, newValue] of newValues) {
      if (setting === 'stakingDuration') {
        expect(
          await settings.stakingDurations(collector)
        ).to.be.bignumber.equal(new BN(0));
        await expectRevert(
          settings.setStakingDuration(collector, newValue, {
            from: anyone
          }),
          'Permission denied.'
        );
        expect(
          await settings.stakingDurations(collector)
        ).to.be.bignumber.equal(new BN(0));
      } else if (setting === 'collectorPaused') {
        expect(await settings.pausedCollectors(collector)).equal(false);
        await expectRevert(
          settings.setCollectorPaused(collector, newValue, {
            from: anyone
          }),
          'Permission denied.'
        );
        expect(await settings.pausedCollectors(collector)).equal(false);
      } else {
        assertEqual(await settings[setting](), initialSettings[setting]);
        const setMethod = getSetMethod(setting);
        await expectRevert(
          settings[setMethod](newValue, {
            from: anyone
          }),
          'Permission denied.'
        );
        assertEqual(await settings[setting](), initialSettings[setting]);
      }
    }
  });

  it('operators can pause collectors', async () => {
    expect(await settings.pausedCollectors(collector)).equal(false);
    const receipt = await settings.setCollectorPaused(collector, true, {
      from: operator
    });
    expectEvent(receipt, 'SettingChanged', {
      settingName: web3.utils.fromAscii('pausedCollectors').padEnd(66, '0')
    });
    expect(await settings.pausedCollectors(collector)).equal(true);
  });

  it("checks that maintainer's fee is less than 100%", async () => {
    await expectRevert(
      settings.setMaintainerFee(new BN(10000), {
        from: admin
      }),
      'Invalid value.'
    );
    assertEqual(await settings.maintainerFee(), initialSettings.maintainerFee);
  });
});
