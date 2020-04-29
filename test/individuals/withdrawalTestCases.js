const { BN, ether } = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../../deployments/settings');

let validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

let testCases = [
  {
    validatorReturn: validatorDepositAmount.add(ether('2.135446705')),
    maintainerFee: new BN(4726),
    maintainerReward: ether('1.0092121127830'),
    userDeposit: validatorDepositAmount,
    userReward: ether('1.1262345922170')
  },
  {
    validatorReturn: validatorDepositAmount.add(ether('1.458659773')),
    maintainerFee: new BN(1949),
    maintainerReward: ether('0.2842927897577'),
    userDeposit: validatorDepositAmount,
    userReward: ether('1.1743669832423')
  },
  {
    validatorReturn: validatorDepositAmount.add(ether('0.768218589')),
    maintainerFee: new BN(2669),
    maintainerReward: ether('0.2050375414041'),
    userDeposit: validatorDepositAmount,
    userReward: ether('0.5631810475959')
  }
];

let penalisedTestCases = [
  {
    userDeposit: validatorDepositAmount,
    userPenalisedReturn: validatorDepositAmount.sub(ether('0.17358269'))
  },
  {
    userDeposit: validatorDepositAmount,
    userPenalisedReturn: validatorDepositAmount.sub(ether('1.357496941'))
  },
  {
    userDeposit: validatorDepositAmount,
    userPenalisedReturn: validatorDepositAmount.sub(ether('2.30053178'))
  }
];

module.exports = {
  testCases,
  penalisedTestCases
};
