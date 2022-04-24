const { expect } = require('chai');
const hre = require('hardhat');
const { fromRpcSig } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const { hexlify, keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const {
  BN,
  ether,
  expectEvent,
  constants,
  send,
} = require('@openzeppelin/test-helpers');
const { contracts } = require('../deployments/settings');

const IDepositContract = artifacts.require('IDepositContract');
const IGCToken = artifacts.require('IGCToken');

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
    IDepositContract,
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

async function setTotalRewards({
  rewardToken,
  oracles,
  oracleAccounts,
  pool,
  totalRewards,
}) {
  if ((await rewardToken.totalSupply()).eq(totalRewards)) {
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

  // update total rewards
  let receipt = await oracles.submitRewards(
    totalRewards,
    activatedValidators,
    signatures,
    {
      from: oracleAccounts[0],
    }
  );
  expect(await rewardToken.totalSupply()).to.bignumber.equal(totalRewards);

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
  // remove code if it's a contract
  await hre.network.provider.send('hardhat_setCode', [account, '0x']);

  // set balance to 1000 xDAI
  await hre.network.provider.send('hardhat_setBalance', [
    account,
    '0x3635c9adc5dea00000',
  ]);

  // impersonate account
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
  for (let i = 0; i < 4; i++) {
    let newOracle = accounts[i];
    await oracles.addOracle(newOracle, {
      from: admin,
    });
    oracleAccounts.push(newOracle);
  }

  return oracleAccounts;
}

async function mintTokens(token, to, amount) {
  let owner = await token.owner();
  await impersonateAccount(owner);
  await send.ether(to, owner, ether('1'));
  await token.mint(to, amount, {
    from: owner,
  });
}

async function mintMGNOTokens(to, amount) {
  let gnoToken = await IGCToken.at(contracts.GNOToken);
  await mintTokens(gnoToken, to, amount);

  return gnoToken.transferAndCall(contracts.MGNOWrapper, amount, '0x', {
    from: to,
  });
}

async function stakeGNO({
  account,
  amount,
  pool,
  recipient = constants.ZERO_ADDRESS,
  referrer = constants.ZERO_ADDRESS,
  hasRevenueShare = false,
  noAllowance = false,
}) {
  let gnoToken = await IGCToken.at(contracts.GNOToken);
  await mintTokens(gnoToken, account, amount);

  if (!noAllowance) {
    await gnoToken.approve(pool.address, amount, { from: account });
  }
  return pool.stakeGNO(amount, recipient, referrer, hasRevenueShare, {
    from: account,
  });
}

const buildPermitData = ({
  verifyingContract,
  holder,
  spender,
  name,
  expiry = constants.MAX_UINT256,
  allowed = true,
  version = '1',
  chainId = '100',
  nonce = 0,
}) => ({
  primaryType: 'Permit',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'holder', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'allowed', type: 'bool' },
    ],
  },
  domain: { name, version, chainId, verifyingContract },
  message: { holder, spender, nonce, expiry, allowed },
});

async function stakeGNOWithPermit({
  account,
  amount,
  pool,
  minter,
  recipient = constants.ZERO_ADDRESS,
  referrer = constants.ZERO_ADDRESS,
  hasRevenueShare = false,
  invalidHolder = false,
}) {
  let gnoToken = await IGCToken.at(contracts.GNOToken);

  // generate signature
  let nonce = await gnoToken.nonces(account.address);
  let expiry = constants.MAX_UINT256;
  const data = buildPermitData({
    nonce,
    verifyingContract: gnoToken.address,
    holder: invalidHolder ? constants.ZERO_ADDRESS : account.address,
    spender: pool.address,
    name: await gnoToken.name(),
    expiry,
  });
  const signature = ethSigUtil.signTypedMessage(
    Buffer.from(account.privateKey.substring(2), 'hex'),
    { data }
  );
  let { v, r, s } = fromRpcSig(signature);

  // mint tokens
  let owner = await gnoToken.owner();
  await impersonateAccount(owner);
  await send.ether(minter, owner, ether('1'));
  await gnoToken.mint(account.address, amount, {
    from: owner,
  });

  let encodedData = pool.contract.methods
    .stakeGNOWithPermit(
      amount,
      recipient,
      referrer,
      hasRevenueShare,
      nonce,
      expiry,
      v,
      r,
      s
    )
    .encodeABI();

  const tx = {
    from: account.address,
    to: pool.address,
    data: encodedData,
    gas: 1000000,
  };

  let signedTx = await web3.eth.accounts.signTransaction(
    tx,
    account.privateKey
  );
  return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function stakeMGNO({
  account,
  amount,
  pool,
  recipient = constants.ZERO_ADDRESS,
  referrer = constants.ZERO_ADDRESS,
  hasRevenueShare = false,
  noAllowance = false,
}) {
  await mintMGNOTokens(account, amount);
  let mgnoToken = await IGCToken.at(contracts.MGNOToken);
  if (!noAllowance) {
    await mgnoToken.approve(pool.address, amount, { from: account });
  }
  return pool.stakeMGNO(amount, recipient, referrer, hasRevenueShare, {
    from: account,
  });
}

module.exports = {
  checkValidatorRegistered,
  getDepositAmount,
  checkStakedToken,
  checkRewardToken,
  mintMGNOTokens,
  mintTokens,
  stakeGNO,
  stakeGNOWithPermit,
  stakeMGNO,
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
  setActivatedValidators,
  setTotalRewards,
  setMerkleRoot,
  setupOracleAccounts,
  registerValidators,
};
