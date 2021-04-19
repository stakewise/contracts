const { ethers } = require('hardhat');

async function deployPoolEscrow(adminAddress) {
  const PoolEscrow = await ethers.getContractFactory('PoolEscrow');
  const poolEscrow = await PoolEscrow.deploy(adminAddress);
  await poolEscrow.deployed();
  return poolEscrow.address;
}

module.exports = {
  deployPoolEscrow,
};
