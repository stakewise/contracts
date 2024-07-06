const { expect } = require('chai');
const hre = require('hardhat');
const { hexlify, keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const { BN, send, ether } = require('@openzeppelin/test-helpers');

async function mintTokens(token, to, amount) {
  let owner = await token.owner();
  await impersonateAccount(owner);
  await hre.network.provider.request({
    method: 'hardhat_setCode',
    params: [owner, '0x'],
  });
  await send.ether(to, owner, ether('1'));
  await token.mint(to, amount, {
    from: owner,
  });
}

async function checkStakedToken({
  stakedToken,
  totalSupply,
  account,
  balance,
}) {
  if (totalSupply != null) {
    expect(await stakedToken.totalSupply()).to.be.bignumber.equal(totalSupply);
  }

  if (account != null && balance != null) {
    expect(await stakedToken.balanceOf(account)).to.be.bignumber.equal(balance);
  }
}

async function checkRewardToken({
  rewardToken,
  totalSupply,
  account,
  balance,
}) {
  if (totalSupply != null) {
    expect(await rewardToken.totalSupply()).to.be.bignumber.equal(totalSupply);
  }

  if (account != null && balance != null) {
    expect(await rewardToken.balanceOf(account)).to.be.bignumber.equal(balance);
  }
}

async function setActivatedValidators({
  rewardToken,
  oracles,
  oracleAccounts,
  pool,
  activatedValidators,
}) {
  let prevActivatedValidators = await pool.activatedValidators();
  if (prevActivatedValidators.eq(activatedValidators)) {
    return;
  }

  let totalRewards = await rewardToken.totalRewards();
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

async function setTotalRewards({ rewardToken, totalRewards, vault }) {
  const totalSupply = await rewardToken.totalSupply();
  const totalPenalty = await rewardToken.totalPenalty();
  let delta = totalRewards.sub(totalSupply);

  // update total rewards
  let receipt = await rewardToken.updateTotalRewards(delta, {
    from: vault,
  });
  if (delta.isNeg()) {
    delta = new BN(0);
  }
  if (totalPenalty.gt(delta)) {
    delta = new BN(0);
  } else {
    delta = delta.sub(totalPenalty);
  }
  expect(await rewardToken.totalSupply()).to.bignumber.equal(
    totalSupply.add(delta)
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

async function mintMGNOTokens(mgnoToken, account, value) {
  // random mGNO holder
  let holder = '0x6b504204a85e0231b1a1b1926b9264939f29c65e';
  await send.ether(account, holder, ether('5'));
  await impersonateAccount(holder);
  await mgnoToken.transfer(account, value, {
    from: holder,
  });
  await stopImpersonatingAccount(holder);
}

async function mintGNOTokens(gnoToken, account, value) {
  // random GNO holder
  let holder = '0x458cd345b4c05e8df39d0a07220feb4ec19f5e6f';
  await send.ether(account, holder, ether('5'));
  await impersonateAccount(holder);
  await gnoToken.transfer(account, value, {
    from: holder,
  });
  await stopImpersonatingAccount(holder);
}

async function addStakedToken(stakedToken, account, value) {
  // random sGNO holder
  let holder = '0x411fA33f660EDded5dddc57cd50ac33eB4684C6B';
  await send.ether(account, holder, ether('5'));
  await impersonateAccount(holder);
  await stakedToken.transfer(account, value, {
    from: holder,
  });
  await stopImpersonatingAccount(holder);
}

async function addRewardToken(rewardToken, account, value) {
  // random rGNO holder
  let holder = '0xb0e83C2D71A991017e0116d58c5765Abc57384af';
  await send.ether(account, holder, ether('5'));
  await impersonateAccount(holder);
  await rewardToken.transfer(account, value, {
    from: holder,
  });
  await stopImpersonatingAccount(holder);
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
  checkStakedToken,
  checkRewardToken,
  mintMGNOTokens,
  mintTokens,
  mintGNOTokens,
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setActivatedValidators,
  setTotalRewards,
  setMerkleRoot,
  setupOracleAccounts,
  registerValidators,
  addStakedToken,
  addRewardToken,
};
