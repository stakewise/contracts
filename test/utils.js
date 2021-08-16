const { expect } = require('chai');
const hre = require('hardhat');
const { hexlify, keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const {
  BN,
  ether,
  expectEvent,
  constants,
  time,
} = require('@openzeppelin/test-helpers');
const {
  initializeMerkleRoot,
  initializeData,
} = require('./pool/initializeMerkleRoot');
const {
  finalizeMerkleRoot,
  finalizeData,
} = require('./pool/finalizeMerkleRoot');

function getDepositAmount({ min = new BN('1'), max = ether('1000') } = {}) {
  return ether(Math.random().toFixed(8))
    .mul(max.sub(min))
    .div(ether('1'))
    .add(min);
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

  await enableRewardsVoting({ rewardEthToken, oracles, admin });

  let totalRewards = await rewardEthToken.totalRewards();
  let nonce = await oracles.currentNonce();

  let encoded = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [nonce.toString(), totalRewards.toString(), activatedValidators.toString()]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let signature = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(signature);
  }

  // update activated validators
  let receipt = await oracles.submitRewards(
    totalRewards,
    activatedValidators,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );

  expect(await pool.activatedValidators()).to.bignumber.equal(
    activatedValidators
  );

  return receipt;
}

async function enableRewardsVoting({ rewardEthToken, oracles, admin }) {
  if (await oracles.isRewardsVoting()) {
    return;
  }
  let lastUpdateBlockNumber = await rewardEthToken.lastUpdateBlockNumber();
  let latestBlock = await time.latestBlock();
  await oracles.setSyncPeriod(
    latestBlock.sub(lastUpdateBlockNumber).sub(new BN(1)),
    {
      from: admin,
    }
  );
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
  await enableRewardsVoting({ rewardEthToken, oracles, admin });

  // calculate candidate ID
  let activatedValidators = await pool.activatedValidators();
  let nonce = await oracles.currentNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [nonce.toString(), totalRewards.toString(), activatedValidators.toString()]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let signature = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(signature);
  }

  // update total rewards
  let receipt = await oracles.submitRewards(
    totalRewards,
    activatedValidators,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
  expect(await rewardEthToken.totalSupply()).to.bignumber.equal(totalRewards);

  return receipt;
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

  let nonce = await oracles.currentNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'bytes32', 'string'],
    [nonce.toString(), merkleRoot, merkleProofs]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let signature = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(signature);
  }

  // update merkle root
  return oracles.submitMerkleRoot(merkleRoot, merkleProofs, signatures, {
    from: oracleAccounts[0],
  });
}

async function initializeValidator({
  operator,
  merkleProof,
  signature,
  publicKey,
  withdrawalCredentials,
  depositDataRoot,
  oracles,
  oracleAccounts,
}) {
  let nonce = await oracles.currentNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'bytes', 'address'],
    [nonce.toString(), publicKey, operator]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let sig = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(sig);
  }

  // initialize validator
  return oracles.initializeValidator(
    { operator, withdrawalCredentials, depositDataRoot, publicKey, signature },
    merkleProof,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
}

async function finalizeValidator({
  operator,
  merkleProof,
  signature,
  publicKey,
  withdrawalCredentials,
  depositDataRoot,
  oracles,
  oracleAccounts,
}) {
  let nonce = await oracles.currentNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'bytes', 'address'],
    [nonce.toString(), publicKey, operator]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let sig = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(sig);
  }

  // finalize validator
  return oracles.finalizeValidator(
    { operator, withdrawalCredentials, depositDataRoot, publicKey, signature },
    merkleProof,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
}

async function registerValidator({
  admin,
  validators,
  operator,
  oracles,
  oracleAccounts,
  initializeMerkleProofs = 'ipfs://QmSYduvpsJp7bo3xenRK3qDdoLkzWcvVeU3U16v1n3Cb5d',
  finalizeMerkleProofs = 'ipfs://QmSTP443zR6oKnYVRE23RARyuuzwhhaidUiSXyRTsw3pDs',
  initAmount = ether('1'),
  depositDataIndex = 0,
}) {
  if ((await validators.getOperator(operator))[2] !== constants.ZERO_BYTES32) {
    await validators.addOperator(
      operator,
      initializeMerkleRoot,
      initializeMerkleProofs,
      finalizeMerkleRoot,
      finalizeMerkleProofs,
      {
        from: admin,
      }
    );
  }

  if ((await validators.collaterals(operator)).lt(initAmount)) {
    await validators.depositCollateral(operator, {
      value: initAmount,
      from: operator,
    });
  }

  let {
    publicKey,
    signature,
    withdrawalCredentials,
    merkleProof,
    depositDataRoot,
  } = initializeData[depositDataIndex];
  await initializeValidator({
    operator,
    merkleProof,
    signature,
    publicKey,
    depositDataRoot,
    oracles,
    oracleAccounts,
    withdrawalCredentials,
  });

  ({
    publicKey,
    signature,
    withdrawalCredentials,
    merkleProof,
    depositDataRoot,
  } = finalizeData[depositDataIndex]);
  await finalizeValidator({
    operator,
    merkleProof,
    signature,
    publicKey,
    depositDataRoot,
    oracles,
    oracleAccounts,
    withdrawalCredentials,
  });
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

async function setupOracleAccounts({ admin, oracles, accounts }) {
  let oracleRole = await oracles.ORACLE_ROLE();
  const totalOracles = (
    await oracles.getRoleMemberCount(oracleRole)
  ).toNumber();

  // remove oracles
  for (let i = 0; i < totalOracles; i++) {
    let oldOracle = await oracles.getRoleMember(oracleRole, 0);
    await oracles.removeOracle(oldOracle, { from: admin });
  }

  // add oracles
  let oracleAccounts = [];
  for (let i = 0; i < totalOracles; i++) {
    let newOracle = accounts[i];
    await oracles.addOracle(newOracle, { from: admin });
    oracleAccounts.push(newOracle);
  }

  return oracleAccounts;
}

module.exports = {
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
  setupOracleAccounts,
  enableRewardsVoting,
  initializeValidator,
  finalizeValidator,
  registerValidator,
};
