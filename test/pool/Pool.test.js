const { expect } = require('chai');
const { ether, BN } = require('@openzeppelin/test-helpers');
const {
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
} = require('../utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');

const Pool = artifacts.require('Pool');
const IGCToken = artifacts.require('IGCToken');

contract('Pool', (accounts) => {
  const admin = contractSettings.admin;
  let [vault] = accounts;
  let pool, mgnoToken, gnoToken;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    let upgradedContracts = await upgradeContracts(vault);

    mgnoToken = await IGCToken.at(contracts.MGNOToken);
    gnoToken = await IGCToken.at(contracts.GNOToken);
    pool = await Pool.at(upgradedContracts.pool);
  });

  afterEach(async () => resetFork());

  it('transfers all GNO to pool escrow', async () => {
    const gnoBalance = await gnoToken.balanceOf(pool.address);
    const mgnoBalance = await mgnoToken.balanceOf(pool.address);
    const poolEscrowGnoBalance = await gnoToken.balanceOf(contracts.poolEscrow);
    expect(
      await mgnoToken.balanceOf(contracts.poolEscrow)
    ).to.be.bignumber.equal(new BN(0));
    await pool.transferToPoolEscrow();
    expect(await gnoToken.balanceOf(pool.address)).to.be.bignumber.equal(
      new BN(0)
    );
    expect(await mgnoToken.balanceOf(pool.address)).to.be.bignumber.equal(
      new BN(0)
    );
    expect(
      await gnoToken.balanceOf(contracts.poolEscrow)
    ).to.be.bignumber.equal(
      gnoBalance
        .add(poolEscrowGnoBalance)
        .add(mgnoBalance.mul(ether('1')).div(ether('32')))
    );
    expect(
      await mgnoToken.balanceOf(contracts.poolEscrow)
    ).to.be.bignumber.equal(new BN(0));
  });
});
