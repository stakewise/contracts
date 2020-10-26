const { expect } = require('chai');
const { BN, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { deployAllContracts } = require('../../deployments');
const { initialSettings } = require('../../deployments/settings');
const {
  getDepositAmount,
  checkCollectorBalance,
  checkPoolCollectedAmount,
  checkStakingEthToken,
} = require('../utils');

const Pool = artifacts.require('Pool');
const Settings = artifacts.require('Settings');
const StakingEthToken = artifacts.require('StakingEthToken');

contract('Pool (add deposit)', ([_, admin, sender1, sender2]) => {
  let pool, settings, stakingEthToken;

  beforeEach(async () => {
    let {
      pool: poolContractAddress,
      settings: settingsContractAddress,
      stakingEthToken: stakingEthTokenContractAddress,
    } = await deployAllContracts({ initialAdmin: admin });
    pool = await Pool.at(poolContractAddress);
    settings = await Settings.at(settingsContractAddress);
    stakingEthToken = await StakingEthToken.at(stakingEthTokenContractAddress);
  });

  it('fails to add a deposit with zero amount', async () => {
    await expectRevert(
      pool.addDeposit({ from: sender1, value: ether('0') }),
      'Pool: invalid deposit amount'
    );
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('fails to add a deposit with unit less than minimum', async () => {
    await expectRevert(
      pool.addDeposit({ from: sender1, value: ether('1').sub(new BN(1)) }),
      'Pool: invalid deposit amount'
    );
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('fails to add too large deposit', async () => {
    await expectRevert(
      pool.addDeposit({
        from: sender1,
        value: new BN(initialSettings.maxDepositAmount).add(ether('1')),
      }),
      'Pool: deposit amount is too large'
    );
    await checkCollectorBalance(pool);
    await checkPoolCollectedAmount(pool);
  });

  it('fails to add a deposit to paused pool', async () => {
    await settings.setPausedContracts(pool.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(pool.address)).equal(true);

    await expectRevert(
      pool.addDeposit({
        from: sender1,
        value: ether('1'),
      }),
      'Pool: contract is paused'
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
    await checkStakingEthToken({
      stakingEthToken,
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
    await checkStakingEthToken({
      stakingEthToken,
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
