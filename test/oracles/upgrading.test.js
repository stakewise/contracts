const { upgrades } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const {
  deployAllContracts,
  upgradeAllContracts,
} = require('../../deployments');

const Oracles = artifacts.require('Oracles');
const Pool = artifacts.require('Pool');

contract('Oracles (upgrading)', ([admin, sender1]) => {
  let oracles, pool;

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
  });

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      oracles.upgrade(pool.address, { from: sender1 }),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      oracles.upgrade(pool.address, { from: admin }),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await oracles.pause({ from: admin });
    await expectRevert(
      oracles.upgrade(pool.address, { from: admin }),
      'Oracles: already upgraded'
    );
  });
});
