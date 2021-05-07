const hre = require('hardhat');
const { expectEvent, constants, time } = require('@openzeppelin/test-helpers');
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
  balance,
}) {
  if (totalSupply != null) {
    expect(await stakedEthToken.totalSupply()).to.be.bignumber.equal(
      totalSupply
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

async function setActivatedValidators({
  admin,
  rewardEthToken,
  oracles,
  oracleAccounts,
  pool,
  activatedValidators,
}) {
  let prevActivatedValidators = await pool.activatedValidators();
  if (prevActivatedValidators.eq(activatedValidators)) {
    return;
  }

  let newSyncPeriod = new BN('700');
  await oracles.setSyncPeriod(newSyncPeriod, {
    from: admin,
  });
  let lastUpdateBlockNumber = await rewardEthToken.lastUpdateBlockNumber();
  await time.advanceBlockTo(lastUpdateBlockNumber.add(new BN(newSyncPeriod)));

  let totalRewards = await rewardEthToken.totalRewards();
  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.voteForRewards(totalRewards, activatedValidators, {
      from: oracleAccounts[i],
    });
    if ((await pool.activatedValidators()).eq(activatedValidators)) {
      return receipt;
    }
  }
}

async function setTotalRewards({
  admin,
  rewardEthToken,
  oracles,
  oracleAccounts,
  pool,
  totalRewards,
}) {
  if ((await rewardEthToken.totalSupply()).eq(totalRewards)) {
    return;
  }

  let newSyncPeriod = new BN('700');
  await oracles.setSyncPeriod(newSyncPeriod, {
    from: admin,
  });
  let lastUpdateBlockNumber = await rewardEthToken.lastUpdateBlockNumber();
  await time.advanceBlockTo(lastUpdateBlockNumber.add(new BN(newSyncPeriod)));

  let activatedValidators = await pool.activatedValidators();
  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.voteForRewards(totalRewards, activatedValidators, {
      from: oracleAccounts[i],
    });
    if ((await rewardEthToken.totalSupply()).eq(totalRewards)) {
      return receipt;
    }
  }
}

async function setMerkleRoot({
  merkleDistributor,
  merkleRoot,
  merkleProofs,
  oracles,
  oracleAccounts,
}) {
  if ((await merkleDistributor.merkleRoot()) === merkleRoot) {
    return;
  }

  let receipt;
  for (let i = 0; i < oracleAccounts.length; i++) {
    receipt = await oracles.voteForMerkleRoot(merkleRoot, merkleProofs, {
      from: oracleAccounts[i],
    });
    if ((await merkleDistributor.merkleRoot()) === merkleRoot) {
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
  checkStakedEthToken,
  checkRewardEthToken,
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setActivatedValidators,
  setTotalRewards,
  setMerkleRoot,
  getOracleAccounts,
};
