const hre = require('hardhat');

let contractSettings, contracts;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contractSettings = {
    admin: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    validatorRegistration: '0xff50ed3d0ec03aC01D4C79aAd74928BFF48a7b2b',
    protocolFeeRecipient: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    minActivatingDeposit: '32000000000000000000',
    pendingValidatorsLimit: '500',
    protocolFee: '1000',
  };
  contracts = {
    stakeWiseToken: '0x0e2497aACec2755d831E4AFDEA25B4ef1B823855',
  };
} else {
  contractSettings = {
    admin: '0x144a98cb1CdBb23610501fE6108858D9B7D24934',
    validatorRegistration: '0x00000000219ab540356cBB839Cbe05303d7705Fa',
    protocolFeeRecipient: '0x1867c96601bc5fE24F685d112314B8F3Fe228D5A',
    minActivatingDeposit: '32000000000000000000',
    pendingValidatorsLimit: '500',
    protocolFee: '1000',
  };
  contracts = {
    stakeWiseToken: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
  };
}

module.exports = {
  contractSettings,
  contracts,
};
