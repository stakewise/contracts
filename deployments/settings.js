const { constants } = require('@openzeppelin/test-helpers');

let contractSettings = {
  admin: '0x8737f638E9af54e89ed9E1234dbC68B115CD169e',
  validatorRegistration: '0x0B98057eA310F4d31F2a452B414647007d1645d9',
  protocolFeeRecipient: constants.ZERO_ADDRESS,
  minActivatingDeposit: constants.MAX_UINT256.toString(),
  pendingValidatorsLimit: '500',
  protocolFee: '1000',
};
let contracts = {
  MGNOWrapper: '0x647507A70Ff598F386CB96ae5046486389368C66',
  MGNOToken: '0x722fc4DAABFEaff81b97894fC623f91814a1BF68',
  GNOToken: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
  stakeWiseToken: '0xfdA94F056346d2320d4B5E468D6Ad099b2277746',
  oracles: '0xa6D123620Ea004cc5158b0ec260E934bd45C78c1',
  pool: '0x2f99472b727e15EECf9B9eFF9F7481B85d3b4444',
  poolValidators: '0xcF2C1A38F59400E8eA2AFD74C3AC4adF97526e18',
  poolEscrow: '0xfc9B67b6034F6B306EA9Bd8Ec1baf3eFA2490394',
  stakedToken: '0xA4eF9Da5BA71Cc0D2e5E877a910A37eC43420445',
  rewardToken: '0x6aC78efae880282396a335CA2F79863A1e6831D4',
  merkleDistributor: '0x7dc30953CE236665d032329F6a922d67F0a33a2B',
  roles: '0x9b23e05AEfb37D5ea9b525016d19eb82b65F255c',
  contractChecker: '0x814f9c8C0269f11996138c77cc16A3A7f0A36b0C',
};

module.exports = {
  contractSettings,
  contracts,
};
