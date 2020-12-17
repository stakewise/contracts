const { ethers } = require('hardhat');
const { ownablePausableTests } = require('./OwnablePausableTests');

const OwnablePausableUpgradeableMock = artifacts.require(
  'OwnablePausableUpgradeableMock'
);

let getOwnableContract = async (admin) => {
  const OwnableMock = await ethers.getContractFactory(
    'OwnablePausableUpgradeableMock'
  );
  const ownableMock = await OwnableMock.deploy();
  await ownableMock.initialize(admin);
  return OwnablePausableUpgradeableMock.at(ownableMock.address);
};

contract('OwnablePausableUpgradeable', ([_, ...accounts]) => {
  ownablePausableTests({
    accounts,
    getOwnableContract,
    contractName: 'OwnablePausableUpgradeable',
  });
});
