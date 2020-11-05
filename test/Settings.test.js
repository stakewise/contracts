const { expect } = require('chai');
const {
  BN,
  ether,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
} = require('../deployments/access');
const {
  deployAndInitializeSettings,
  initialSettings,
} = require('../deployments/settings');

const newValues = [
  ['minDepositUnit', ether('0.002')],
  ['maxDepositAmount', ether('11000')],
  ['validatorPrice', new BN(3703171921051)],
  ['maintainer', '0xF4904844B4aF87f4036E77Ad1697bEcf703c8439'],
  ['maintainerFee', new BN(100)],
  ['pausedContracts', true],
  ['supportedPaymentTokens', true],
  ['allContractsPaused', true],
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

contract('Settings', ([_, admin, operator, collector, token, anyone]) => {
  let adminsContractAddress, operatorsContractAddress, settings;

  before(async () => {
    adminsContractAddress = await deployAndInitializeAdmins(admin);
    operatorsContractAddress = await deployAndInitializeOperators(
      adminsContractAddress
    );
    let operators = await Operators.at(operatorsContractAddress);
    await operators.addOperator(operator, { from: admin });
  });

  beforeEach(async () => {
    settings = await Settings.at(
      await deployAndInitializeSettings(
        adminsContractAddress,
        operatorsContractAddress
      )
    );
  });

  it('admins can change settings', async () => {
    for (const [setting, newValue] of newValues) {
      if (setting === 'pausedContracts') {
        await assertEqual(await settings[setting](collector), false);
        const setMethod = getSetMethod(setting);
        const receipt = await settings[setMethod](collector, true, {
          from: admin,
        });
        expectEvent(receipt, 'SettingChanged', {
          settingName: web3.utils.fromAscii(setting).padEnd(66, '0'),
        });
        expect(await settings[setting](collector)).equal(true);
      } else if (setting === 'supportedPaymentTokens') {
        await assertEqual(await settings[setting](token), false);
        const setMethod = getSetMethod(setting);
        const receipt = await settings[setMethod](token, true, {
          from: admin,
        });
        expectEvent(receipt, 'PaymentTokenUpdated', {
          token,
        });
        expect(await settings[setting](token)).equal(true);
      } else {
        await assertEqual(await settings[setting](), initialSettings[setting]);
        const setMethod = getSetMethod(setting);
        const receipt = await settings[setMethod](newValue, {
          from: admin,
        });
        expectEvent(receipt, 'SettingChanged', {
          settingName: web3.utils.fromAscii(setting).padEnd(66, '0'),
        });
        assertEqual(await settings[setting](), newValue);
      }
    }
  });

  it('others cannot change settings', async () => {
    for (const [setting, newValue] of newValues) {
      if (
        setting === 'pausedContracts' ||
        setting === 'supportedPaymentTokens'
      ) {
        await assertEqual(await settings[setting](collector), false);
        const setMethod = getSetMethod(setting);
        await expectRevert(
          settings[setMethod](collector, true, {
            from: anyone,
          }),
          'Settings: permission denied'
        );
        expect(await settings[setting](collector)).equal(false);
      } else {
        assertEqual(await settings[setting](), initialSettings[setting]);
        const setMethod = getSetMethod(setting);
        await expectRevert(
          settings[setMethod](newValue, {
            from: anyone,
          }),
          'Settings: permission denied'
        );
        assertEqual(await settings[setting](), initialSettings[setting]);
      }
    }
  });

  it('operators can pause contracts', async () => {
    expect(await settings.pausedContracts(collector)).equal(false);
    const receipt = await settings.setPausedContracts(collector, true, {
      from: operator,
    });
    expectEvent(receipt, 'SettingChanged', {
      settingName: web3.utils.fromAscii('pausedContracts').padEnd(66, '0'),
    });
    expect(await settings.pausedContracts(collector)).equal(true);
  });

  it('admin can pause all contracts', async () => {
    expect(await settings.pausedContracts(collector)).equal(false);
    const receipt = await settings.setAllContractsPaused(true, {
      from: admin,
    });
    expectEvent(receipt, 'SettingChanged', {
      settingName: web3.utils.fromAscii('allContractsPaused').padEnd(66, '0'),
    });
    expect(await settings.pausedContracts(collector)).equal(true);
  });

  it("checks that maintainer's fee is less than 100%", async () => {
    await expectRevert(
      settings.setMaintainerFee(new BN(10000), {
        from: admin,
      }),
      'Settings: invalid value'
    );
    assertEqual(await settings.maintainerFee(), initialSettings.maintainerFee);
  });
});
