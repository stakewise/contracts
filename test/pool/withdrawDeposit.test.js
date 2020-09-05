const { BN, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../../deployments/common');
const {
  getDepositAmount,
  removeNetworkFile,
  checkCollectorBalance,
  checkPoolCollectedAmount,
  checkSWDToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const SWDToken = artifacts.require('SWDToken');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

contract('Pool (withdraw deposit)', ([_, sender1, sender2]) => {
  let networkConfig, pool, swdToken, deposit1, deposit2, totalSupply;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let { pool: poolProxy, swdToken: swdTokenProxy } = await deployAllProxies({
      networkConfig,
    });
    pool = await Pool.at(poolProxy);
    swdToken = await SWDToken.at(swdTokenProxy);

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
