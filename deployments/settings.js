const { constants } = require('@openzeppelin/test-helpers');

let contractSettings = {
  admin: '0x8737f638E9af54e89ed9E1234dbC68B115CD169e',
  validatorRegistration: '0x0B98057eA310F4d31F2a452B414647007d1645d9',
  protocolFeeRecipient: '0x8737f638E9af54e89ed9E1234dbC68B115CD169e',
  minActivatingDeposit: constants.MAX_UINT256.toString(),
  pendingValidatorsLimit: '500',
  protocolFee: '1000',
};
let contracts = {
  MGNOWrapper: '0x647507A70Ff598F386CB96ae5046486389368C66',
  MGNOToken: '0x722fc4DAABFEaff81b97894fC623f91814a1BF68',
  GNOToken: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
  stakeWiseToken: '0xfdA94F056346d2320d4B5E468D6Ad099b2277746',
  oracles: '0xd0f5ddaed2D8BaE1F451D2A11FFAe1806f2Ee1a5',
  pool: '0x9E6631d118C28b3d61c68F14FF30a99f7e91963a',
  poolValidators: '0xc8D8B1D8C37925CDf106C955aC330739eF4E9362',
  poolEscrow: '0xfc9B67b6034F6B306EA9Bd8Ec1baf3eFA2490394',
  stakedToken: '0x9AEBd2322D3D5fB69324a3cFE380DD11Bc3694D2',
  rewardToken: '0x6FFa613eD41585B1c1e517A78d140cFBD68be639',
  merkleDistributor: '0x8c8F5BF28081984527dd94c627F591E28db7e7A0',
  roles: '0x61975c09207c5DFe794b0A652C8CAf8458159AAe',
  contractChecker: '0x814f9c8C0269f11996138c77cc16A3A7f0A36b0C',
};

module.exports = {
  contractSettings,
  contracts,
};
