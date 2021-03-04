const { expect } = require('chai');
const { upgrades } = require('hardhat');
const {
  ether,
  expectRevert,
  expectEvent,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  preparePoolUpgrade,
  preparePoolUpgradeData,
  upgradePool,
} = require('../../deployments/collectors');
const { initialSettings } = require('../../deployments/settings');
const { deployAllContracts } = require('../../deployments');

const Pool = artifacts.require('Pool');

contract('Pool (settings)', ([admin, anyone, oracles]) => {
  let pool;

  beforeEach(async () => {
    let { pool: poolContractAddress } = await deployAllContracts({
      initialAdmin: admin,
    });

    const proxyAdmin = await upgrades.admin.getInstance();

    // upgrade pool
    pool = await Pool.at(poolContractAddress);
    await pool.addAdmin(proxyAdmin.address, { from: admin });
    await pool.pause({ from: admin });
    const poolImplementation = await preparePoolUpgrade(poolContractAddress);
    const poolUpgradeData = await preparePoolUpgradeData(
      oracles,
      initialSettings.activationDuration,
      initialSettings.beaconActivatingAmount,
      initialSettings.minActivatingDeposit,
      initialSettings.minActivatingShare
    );
    await upgradePool(poolContractAddress, poolImplementation, poolUpgradeData);
    await pool.unpause({ from: admin });
  });

  describe('min activating deposit', () => {
    it('not admin fails to set min activating deposit', async () => {
      await expectRevert(
        pool.setMinActivatingDeposit(ether('10'), {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set min activating deposit', async () => {
      let minActivatingDeposit = ether('10');
      let receipt = await pool.setMinActivatingDeposit(minActivatingDeposit, {
        from: admin,
      });
      await expectEvent(receipt, 'MinActivatingDepositUpdated', {
        minActivatingDeposit,
        sender: admin,
      });
      expect(await pool.minActivatingDeposit()).to.bignumber.equal(
        minActivatingDeposit
      );
    });
  });

  describe('min activating share', () => {
    it('not admin fails to set min activating share', async () => {
      await expectRevert(
        pool.setMinActivatingShare('1000', {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can set min activating share', async () => {
      let minActivatingShare = '1000';
      let receipt = await pool.setMinActivatingShare(minActivatingShare, {
        from: admin,
      });
      await expectEvent(receipt, 'MinActivatingShareUpdated', {
        minActivatingShare,
        sender: admin,
      });
      expect(await pool.minActivatingShare()).to.bignumber.equal(
        minActivatingShare
      );
    });

    it('fails to set invalid min activating share', async () => {
      await expectRevert(
        pool.setMinActivatingShare(10000, {
          from: admin,
        }),
        'Pool: invalid share'
      );
    });
  });

  describe('activation duration', () => {
    it('not oracles contract fails to set activation duration', async () => {
      await expectRevert(
        pool.setActivationDuration(ether('10'), {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('oracles contract can set activation duration', async () => {
      let activationDuration = new BN('2592000');
      let receipt = await pool.setActivationDuration(activationDuration, {
        from: oracles,
      });
      await expectEvent(receipt, 'ActivationDurationUpdated', {
        activationDuration,
        sender: oracles,
      });
      expect(await pool.activationDuration()).to.bignumber.equal(
        activationDuration
      );
    });
  });

  describe('total activating amount', () => {
    it('not oracles contract fails to set total activating amount', async () => {
      await expectRevert(
        pool.setTotalActivatingAmount(ether('100'), {
          from: anyone,
        }),
        'Pool: access denied'
      );
    });

    it('oracles contract can set total activating amount', async () => {
      let totalActivatingAmount = new BN('100');
      let receipt = await pool.setTotalActivatingAmount(totalActivatingAmount, {
        from: oracles,
      });
      await expectEvent(receipt, 'TotalActivatingAmountUpdated', {
        totalActivatingAmount,
        sender: oracles,
      });
      expect(await pool.totalActivatingAmount()).to.bignumber.equal(
        totalActivatingAmount
      );
    });
  });

  describe('withdrawal credentials', () => {
    const withdrawalCredentials =
      '0x0072ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4';

    it('not admin fails to update withdrawal credentials', async () => {
      await expectRevert(
        pool.setWithdrawalCredentials(withdrawalCredentials, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update withdrawal credentials', async () => {
      let receipt = await pool.setWithdrawalCredentials(withdrawalCredentials, {
        from: admin,
      });

      await expectEvent(receipt, 'WithdrawalCredentialsUpdated', {
        withdrawalCredentials,
      });
      expect(await pool.withdrawalCredentials()).to.equal(
        withdrawalCredentials
      );
    });
  });
});
