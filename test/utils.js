const { expect } = require('chai');
const hre = require('hardhat');
const { hexlify, keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const {
  BN,
  ether,
  expectEvent,
  balance,
} = require('@openzeppelin/test-helpers');
const { contracts } = require('../deployments/settings');

const iDepositContract = artifacts.require('IDepositContract');

function getDepositAmount({ min = new BN('1'), max = ether('1000') } = {}) {
  return ether(Math.random().toFixed(8))
    .mul(max.sub(min))
    .div(ether('1'))
    .add(min);
}

async function checkValidatorRegistered({
  transaction,
  pubKey,
  signature,
  withdrawalCredentials,
  validatorDepositAmount = ether('32'),
}) {
  // Check VRC record created
  await expectEvent.inTransaction(
    transaction,
    iDepositContract,
    'DepositEvent',
    {
      pubkey: pubKey,
      withdrawal_credentials: withdrawalCredentials,
      amount: web3.utils.bytesToHex(
        new BN(web3.utils.fromWei(validatorDepositAmount, 'gwei')).toArray(
          'le',
          8
        )
      ),
      signature: signature,
    }
  );
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

  let totalRewards = await rewardEthToken.totalRewards();
  let nonce = await oracles.currentRewardsNonce();

  let encoded = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [nonce.toString(), activatedValidators.toString(), totalRewards.toString()]
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
  // calculate candidate ID
  let activatedValidators = await pool.activatedValidators();
  let nonce = await oracles.currentRewardsNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [nonce.toString(), activatedValidators.toString(), totalRewards.toString()]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let signature = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(signature);
  }
  let feesEscrowBalance = await balance.current(contracts.feesEscrow);

  // update total rewards
  let receipt = await oracles.submitRewards(
    totalRewards,
    activatedValidators,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
  expect(await rewardEthToken.totalSupply()).to.bignumber.equal(
    totalRewards.add(feesEscrowBalance)
  );

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

  let nonce = await oracles.currentRewardsNonce();
  let encoded = defaultAbiCoder.encode(
    ['uint256', 'string', 'bytes32'],
    [nonce.toString(), merkleProofs, merkleRoot]
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

async function registerValidators({
  depositData,
  merkleProofs,
  oracles,
  oracleAccounts,
  validatorsDepositRoot,
}) {
  let nonce = await oracles.currentValidatorsNonce();
  let encoded = defaultAbiCoder.encode(
    [
      'uint256',
      'tuple(address operator,bytes32 withdrawalCredentials,bytes32 depositDataRoot,bytes publicKey,bytes signature)[]',
      'bytes32',
    ],
    [nonce.toString(), depositData, validatorsDepositRoot]
  );
  let candidateId = hexlify(keccak256(encoded));

  // prepare signatures
  let signatures = [];
  for (let i = 0; i < oracleAccounts.length; i++) {
    await impersonateAccount(oracleAccounts[i]);
    let sig = await web3.eth.sign(candidateId, oracleAccounts[i]);
    signatures.push(sig);
  }

  // register validator
  return oracles.registerValidators(
    depositData,
    merkleProofs,
    validatorsDepositRoot,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
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
    await oracles.addOracle(newOracle, {
      from: admin,
    });
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
  registerValidators,
};
