let contractSettings = {
  admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
  validatorRegistration: '0x0B98057eA310F4d31F2a452B414647007d1645d9',
  protocolFeeRecipient: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
  minActivatingDeposit: '32000000000000000000',
  pendingValidatorsLimit: '500',
  protocolFee: '1000',
};
let contracts = {
  MGNOWrapper: '0x647507A70Ff598F386CB96ae5046486389368C66',
  MGNOToken: '0x722fc4DAABFEaff81b97894fC623f91814a1BF68',
  GNOToken: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
  stakeWiseToken: '0xfdA94F056346d2320d4B5E468D6Ad099b2277746',
};

module.exports = {
  contractSettings,
  contracts,
};
