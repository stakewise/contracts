const hre = require('hardhat');
const { expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { BN, ether, balance } = require('@openzeppelin/test-helpers');

function getDepositAmount({ min = new BN('1'), max = ether('1000') } = {}) {
  return ether(Math.random().toFixed(8))
    .mul(max.sub(min))
    .div(ether('1'))
    .add(min);
}

async function checkSolo({
  solos,
  soloId,
  withdrawalCredentials = constants.ZERO_BYTES32,
  amount = new BN(0),
} = {}) {
  let solo = await solos.solos(soloId);
  expect(solo.amount).to.bignumber.equal(amount);
  expect(solo.withdrawalCredentials).equal(withdrawalCredentials);
}

async function checkCollectorBalance(
  collectorContract,
  correctBalance = new BN(0)
) {
  expect(
    await balance.current(collectorContract.address)
  ).to.be.bignumber.equal(correctBalance);
}

async function checkPoolTotalActivatingAmount(
  poolContract,
  correctAmount = new BN(0)
) {
  let totalActivatingAmount = await poolContract.totalActivatingAmount();
  expect(totalActivatingAmount).to.be.bignumber.equal(correctAmount);
}

async function checkSoloDepositAdded({
  receipt,
  solos,
  sender,
  withdrawalCredentials,
  addedAmount,
  totalAmount,
}) {
  let soloId = web3.utils.soliditySha3(
    solos.address,
    sender,
    withdrawalCredentials
  );

  expectEvent(receipt, 'DepositAdded', {
    soloId,
    sender: sender,
    amount: addedAmount,
    withdrawalCredentials,
  });

  await checkSolo({
    solos,
    soloId,
    withdrawalCredentials,
    amount: totalAmount,
  });
}

async function checkValidatorRegistered({
  vrc,
  transaction,
  pubKey,
  signature,
  withdrawalCredentials,
  validatorDepositAmount = ether('32'),
}) {
  // Check VRC record created
  await expectEvent.inTransaction(transaction, vrc, 'DepositEvent', {
    pubkey: pubKey,
    withdrawal_credentials: withdrawalCredentials,
    amount: web3.utils.bytesToHex(
      new BN(web3.utils.fromWei(validatorDepositAmount, 'gwei')).toArray(
        'le',
        8
      )
    ),
    signature: signature,
  });
}

async function checkStakedEthToken({
  stakedEthToken,
  totalSupply,
  account,
  deposit,
  balance,
}) {
  if (totalSupply != null) {
    expect(await stakedEthToken.totalSupply()).to.be.bignumber.equal(
      totalSupply
    );
  }

  if (account != null && deposit != null) {
    expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
      deposit
    );
  }

  if (account != null && balance != null) {
    expect(await stakedEthToken.balanceOf(account)).to.be.bignumber.equal(
      balance
    );
  }
}

async function checkRewardEthToken({
  rewardEthToken,
  totalSupply,
  account,
  balance,
}) {
  if (totalSupply != null) {
    expect(await rewardEthToken.totalSupply()).to.be.bignumber.equal(
      totalSupply
    );
  }

  if (account != null && balance != null) {
    expect(await rewardEthToken.balanceOf(account)).to.be.bignumber.equal(
      balance
    );
  }
}

async function getOracleAccounts({ oracles }) {
  let oracleAccounts = [];
  let oracleRole = await oracles.ORACLE_ROLE();
  for (let i = 0; i < (await oracles.getRoleMemberCount(oracleRole)); i++) {
    let oracle = await oracles.getRoleMember(oracleRole, i);
    await impersonateAccount(oracle);
    oracleAccounts.push(oracle);
  }
  return oracleAccounts;
}

async function setActivationDuration({
  rewardEthToken,
  oracles,
  oracleAccounts,
  pool,
  activationDuration,
}) {
  let prevActivationDuration = await pool.activationDuration();
  if (prevActivationDuration.eq(activationDuration)) {
    return;
  }

  let totalRewards = await rewardEthToken.totalRewards();
  let beaconActivatingAmount = (await pool.totalActivatingAmount()).sub(
    await balance.current(pool.address)
  );
  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.vote(
      totalRewards,
      activationDuration,
      beaconActivatingAmount,
      {
        from: oracleAccounts[i],
      }
    );
    if ((await pool.activationDuration()).eq(activationDuration)) {
      return receipt;
    }
  }
}

async function setTotalActivatingAmount({
  rewardEthToken,
  oracles,
  oracleAccounts,
  pool,
  totalActivatingAmount,
}) {
  let prevTotalActivatingAmount = await pool.totalActivatingAmount();
  if (prevTotalActivatingAmount.eq(totalActivatingAmount)) {
    return;
  }

  let totalRewards = await rewardEthToken.totalRewards();
  let activationDuration = await pool.activationDuration();
  let beaconActivatingAmount = totalActivatingAmount.sub(
    await balance.current(pool.address)
  );
  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.vote(
      totalRewards,
      activationDuration,
      beaconActivatingAmount,
      {
        from: oracleAccounts[i],
      }
    );
    if ((await pool.totalActivatingAmount()).eq(totalActivatingAmount)) {
      return receipt;
    }
  }
}

async function setTotalRewards({
  rewardEthToken,
  oracles,
  oracleAccounts,
  pool,
  totalRewards,
}) {
  if ((await rewardEthToken.totalSupply()).eq(totalRewards)) {
    return;
  }

  let activationDuration = await pool.activationDuration();
  let beaconActivatingAmount = (await pool.totalActivatingAmount()).sub(
    await balance.current(pool.address)
  );
  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.vote(
      totalRewards,
      activationDuration,
      beaconActivatingAmount,
      {
        from: oracleAccounts[i],
      }
    );
    if ((await rewardEthToken.totalSupply()).eq(totalRewards)) {
      return receipt;
    }
  }
}

async function impersonateAccount(account) {
  return hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [account],
  });
}

async function stopImpersonatingAccount(account) {
  return hre.network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [account],
  });
}

async function resetFork() {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: hre.config.networks.hardhat.forking.url,
          blockNumber: hre.config.networks.hardhat.forking.blockNumber,
        },
      },
    ],
  });
}

module.exports = {
  checkCollectorBalance,
  checkSolo,
  checkSoloDepositAdded,
  checkValidatorRegistered,
  getDepositAmount,
  checkPoolTotalActivatingAmount,
  checkStakedEthToken,
  checkRewardEthToken,
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setActivationDuration,
  setTotalActivatingAmount,
  setTotalRewards,
  getOracleAccounts,
};
