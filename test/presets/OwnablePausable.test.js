const { ethers } = require('hardhat');
const { ownablePausableTests } = require('./OwnablePausableTests');

const OwnablePausableMock = artifacts.require('OwnablePausableMock');

let getOwnableContract = async (admin) => {
  const OwnableMock = await ethers.getContractFactory('OwnablePausableMock');
  const ownableMock = await OwnableMock.deploy(admin);
  return OwnablePausableMock.at(ownableMock.address);
};

contract('OwnablePausable', ([_, ...accounts]) => {
  ownablePausableTests({
    accounts,
    getOwnableContract,
    contractName: 'OwnablePausable',
  });
});
