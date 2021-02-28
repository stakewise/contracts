const { upgrades } = require('hardhat');
const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../../deployments/settings');
const {
  deployAllContracts,
  upgradeAllContracts,
} = require('../../deployments');

const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

contract('Pool (upgrading)', ([admin, sender1]) => {
  let pool, oracles;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      oracles: oraclesContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
    });

    // upgrade pool
    const proxyAdmin = await upgrades.admin.getInstance();
    oracles = await Oracles.at(oraclesContractAddress);
    pool = await Pool.at(poolContractAddress);
    await pool.addAdmin(proxyAdmin.address, { from: admin });
    await oracles.addAdmin(proxyAdmin.address, { from: admin });

    await oracles.pause({ from: admin });
    await pool.pause({ from: admin });
    await upgradeAllContracts({ poolContractAddress, oraclesContractAddress });
    await oracles.unpause({ from: admin });
    await pool.unpause({ from: admin });

    expect(await pool.activationDuration()).to.bignumber.equal(
      initialSettings.activationDuration
    );
    expect(await pool.minActivatingDeposit()).to.bignumber.equal(
      initialSettings.minActivatingDeposit
    );
  });

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      pool.upgrade(
        oracles.address,
        initialSettings.activationDuration,
        initialSettings.beaconActivatingAmount,
        initialSettings.minActivatingDeposit,
        initialSettings.minActivatingShare,
        { from: sender1 }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      pool.upgrade(
        oracles.address,
        initialSettings.activationDuration,
        initialSettings.beaconActivatingAmount,
        initialSettings.minActivatingDeposit,
        initialSettings.minActivatingShare,
        { from: admin }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await pool.pause({ from: admin });
    await expectRevert(
      pool.upgrade(
        oracles.address,
        initialSettings.activationDuration,
        initialSettings.beaconActivatingAmount,
        initialSettings.minActivatingDeposit,
        initialSettings.minActivatingShare,
        { from: admin }
      ),
      'Pool: already upgraded'
    );
  });
});
