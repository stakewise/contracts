const { expect } = require('chai');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const {
  getDepositAmount,
  checkCollectorBalance,
  checkPoolCollectedAmount,
  checkStakedEthToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const StakedEthToken = artifacts.require('StakedEthToken');

contract('Pool (add deposit)', ([_, admin, sender1, sender2]) => {
  let pool, stakedEthToken;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      stakedEthToken: stakedEthTokenContractAddress,
    } = await deployAllContracts({ initialAdmin: admin });
    pool = await Pool.at(poolContractAddress);
    stakedEthToken = await StakedEthToken.at(stakedEthTokenContractAddress);
  });

  it('fails to add a deposit with zero amount', async () => {
    await expectRevert(
      pool.addDeposit({ from: sender1, value: ether('0') }),
      'Pool: invalid deposit amount'
    );
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('fails to add a deposit to paused pool', async () => {
    await pool.pause({ from: admin });
    expect(await pool.paused()).equal(true);

    await expectRevert(
      pool.addDeposit({
        from: sender1,
        value: ether('1'),
      }),
      'Pausable: paused'
    );
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('adds deposits for different users', async () => {
    // User 1 creates a deposit
    let depositAmount1 = getDepositAmount();
    let totalSupply = depositAmount1;
    await pool.addDeposit({
      from: sender1,
      value: depositAmount1,
    });
    await checkStakedEthToken({
      stakedEthToken,
      totalSupply: depositAmount1,
      account: sender1,
      balance: depositAmount1,
      deposit: depositAmount1,
    });

    // User 2 creates a deposit
    let depositAmount2 = getDepositAmount();
    await pool.addDeposit({
      from: sender2,
      value: depositAmount2,
    });
    totalSupply = totalSupply.add(depositAmount2);
    await checkStakedEthToken({
      stakedEthToken,
      totalSupply,
      account: sender2,
      balance: depositAmount2,
      deposit: depositAmount2,
    });

    // check contract balance
    await checkCollectorBalance(pool, totalSupply);
    await checkPoolCollectedAmount(pool, totalSupply);
  });
});
