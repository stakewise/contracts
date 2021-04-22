const hre = require('hardhat');

async function deployVestingEscrow() {
  // VestingEscrow is deployed without initialization as its clones are initialized
  const VestingEscrow = await hre.ethers.getContractFactory('VestingEscrow');
  const vestingEscrow = await VestingEscrow.deploy();
  await vestingEscrow.deployed();
  return vestingEscrow.address;
}

module.exports = {
  deployVestingEscrow,
};
