const { BN, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const {
  getDepositAmount,
  checkCollectorBalance,
  checkPoolCollectedAmount,
  checkSWDToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const SWDToken = artifacts.require('SWDToken');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Pool (withdraw deposit)', ([_, admin, sender1, sender2]) => {
  let pool, swdToken, settings, deposit1, deposit2, totalSupply;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      swdToken: swdTokenContractAddress,
      settings: settingsContractAddress,
    } = await deployAllContracts({
      initialAdmin: admin,
    });
    pool = await Pool.at(poolContractAddress);
    settings = await Settings.at(settingsContractAddress);
    swdToken = await SWDToken.at(swdTokenContractAddress);

    deposit1 = validatorDepositAmount;
    await pool.addDeposit({
      from: sender1,
      value: deposit1,
    });

    deposit2 = getDepositAmount({
      max: validatorDepositAmount.div(new BN(2)),
    });
    await pool.addDeposit({
      from: sender2,
      value: deposit2,
    });
    totalSupply = deposit1.add(deposit2);
  });

  it('fails to withdraw a deposit with invalid amount', async () => {
    await expectRevert(
      pool.withdrawDeposit(ether('0'), { from: sender1 }),
      'Pool: invalid withdrawal amount'
    );
    await checkCollectorBalance(pool, totalSupply);
    await checkPoolCollectedAmount(pool, totalSupply);
  });

  it('fails to withdraw a deposit with invalid amount unit', async () => {
    await expectRevert(
      pool.withdrawDeposit(deposit2.sub(new BN(1)), { from: sender1 }),
      'Pool: invalid withdrawal amount'
    );
    await checkCollectorBalance(pool, totalSupply);
    await checkPoolCollectedAmount(pool, totalSupply);
  });

  it('fails to withdraw a deposit with insufficient collected amount', async () => {
    await expectRevert(
      pool.withdrawDeposit(deposit2.add(ether('1')), { from: sender1 }),
      'Pool: insufficient collected amount'
    );
    await checkCollectorBalance(pool, totalSupply);
    await checkPoolCollectedAmount(pool, totalSupply);
  });

  it('fails to withdraw deposit from paused pool', async () => {
    await settings.setPausedContracts(pool.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(pool.address)).equal(true);

    await expectRevert(
      pool.withdrawDeposit(deposit2, { from: sender1 }),
      'Pool: contract is paused'
    );
    await checkCollectorBalance(pool, totalSupply);
    await checkPoolCollectedAmount(pool, totalSupply);
  });

  it('can withdraw deposit amount', async () => {
    await pool.withdrawDeposit(deposit2, { from: sender1 });
    await checkSWDToken({
      swdToken,
      totalSupply: totalSupply.sub(deposit2),
      account: sender1,
      balance: deposit1.sub(deposit2),
      deposit: deposit1.sub(deposit2),
    });
  });
});
