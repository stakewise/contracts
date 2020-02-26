const { BN, ether } = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../../deployments/settings');

let validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

let testCases = [
  {
    validatorReturn: validatorDepositAmount.add(ether('0.457599284')),
    maintainerFee: new BN(3506),
    maintainerReward: ether('0.1604343089704'),
    users: [
      { deposit: ether('2.04'), reward: ether('0.01894426715813700') },
      { deposit: ether('3.771'), reward: ether('0.035019035026144425') },
      { deposit: ether('3.782'), reward: ether('0.03512118548631085') },
      { deposit: ether('3.661'), reward: ether('0.033997530424480175') },
      { deposit: ether('4.513'), reward: ether('0.041909547884643275') },
      { deposit: ether('4.166'), reward: ether('0.03868716518666605') },
      { deposit: ether('1.414'), reward: ether('0.01313097733412045') },
      { deposit: ether('0.991'), reward: ether('0.009202827820447925') },
      { deposit: ether('3.043'), reward: ether('0.028258531844221025') },
      { deposit: ether('4.382'), reward: ether('0.04069302876811585') },
      { deposit: ether('0.237'), reward: ether('0.002200878096312975') }
    ]
  },
  {
    validatorReturn: validatorDepositAmount.add(ether('2.343368659')),
    maintainerFee: new BN(1759),
    maintainerReward: ether('0.4121985471181'),
    users: Array(validatorDepositAmount.div(ether('1')).toNumber()).fill({
      deposit: ether('1'),
      reward: ether('0.060349065996309375')
    })
  },
  {
    validatorReturn: validatorDepositAmount.add(ether('1.32400577')),
    maintainerFee: new BN(1928),
    maintainerReward: ether('0.255268312456'),
    users: [{ deposit: ether('32.0'), reward: ether('1.0687374575440') }]
  }
];

let penalisedTestCases = [
  {
    validatorReturn: validatorDepositAmount.sub(ether('0.627626464')),
    users: [
      { deposit: ether('2.255'), penalisedReturn: ether('2.210771947615') },
      { deposit: ether('0.861'), penalisedReturn: ether('0.844112925453') },
      { deposit: ether('0.606'), penalisedReturn: ether('0.594114323838') },
      { deposit: ether('4.776'), penalisedReturn: ether('4.682326750248') },
      { deposit: ether('0.88'), penalisedReturn: ether('0.86274027224') },
      { deposit: ether('1.906'), penalisedReturn: ether('1.868616998738') },
      { deposit: ether('3.021'), penalisedReturn: ether('2.961748139133') },
      { deposit: ether('2.453'), penalisedReturn: ether('2.404888508869') },
      { deposit: ether('0.128'), penalisedReturn: ether('0.125489494144') },
      { deposit: ether('2.756'), penalisedReturn: ether('2.701945670788') },
      { deposit: ether('4.506'), penalisedReturn: ether('4.417622348538') },
      { deposit: ether('3.04'), penalisedReturn: ether('2.98037548592') },
      { deposit: ether('4.618'), penalisedReturn: ether('4.527425655914') },
      { deposit: ether('0.194'), penalisedReturn: ether('0.190195014562') }
    ]
  },
  {
    validatorReturn: validatorDepositAmount.sub(ether('0.243422652')),
    users: Array(validatorDepositAmount.div(ether('1')).toNumber()).fill({
      deposit: ether('1'),
      penalisedReturn: ether('0.992393042125')
    })
  },
  {
    validatorReturn: validatorDepositAmount.sub(ether('2.001935196')),
    users: [{ deposit: ether('32'), penalisedReturn: ether('29.998064804000') }]
  }
];

module.exports = {
  testCases,
  penalisedTestCases
};
