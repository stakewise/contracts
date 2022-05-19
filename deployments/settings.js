const hre = require('hardhat');
const { constants } = require('@openzeppelin/test-helpers');

let contractSettings, contracts;
if (hre.hardhatArguments && hre.hardhatArguments.network === 'goerli') {
  contractSettings = {
    admin: '0x66D6c253084d8d51c7CFfDb3C188A0b53D998a3d',
    validatorRegistration: '0xff50ed3d0ec03aC01D4C79aAd74928BFF48a7b2b',
    protocolFeeRecipient: '0x66D6c253084d8d51c7CFfDb3C188A0b53D998a3d',
    minActivatingDeposit: constants.MAX_UINT256.toString(),
    pendingValidatorsLimit: '500',
    protocolFee: '1000',
    swiseWhale: '0x1867c96601bc5fe24f685d112314b8f3fe228d5a',
  };
  contracts = {
    stakeWiseToken: '0x0e2497aACec2755d831E4AFDEA25B4ef1B823855',
  };
} else {
  contractSettings = {
    admin: '0x6C7692dB59FDC7A659208EEE57C2c876aE54a448',
    validatorRegistration: '0x00000000219ab540356cBB839Cbe05303d7705Fa',
    protocolFeeRecipient: constants.ZERO_ADDRESS,
    minActivatingDeposit: constants.MAX_UINT256.toString(),
    pendingValidatorsLimit: '500',
    protocolFee: '800',
    swiseWhale: '0x47441bD9fb3441370Cb5b6C4684A0104353AEC66',
  };
  contracts = {
    stakeWiseToken: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
    oracles: '0x16c0020fC507C675eA8A3A817416adA3D95c661b',
    pool: '0xeA6b7151b138c274eD8d4D61328352545eF2D4b7',
    poolValidators: '0x270Ad793b7BB315A9fd07F1FFFd8AB1e3621dF7E',
    poolEscrow: '0x5c631621B897F467dD6A91855A0bC97d77B78dc0',
    stakedEthToken: '0x65077fA7Df8e38e135bd4052ac243F603729892d',
    rewardEthToken: '0xCBE26dbC91B05C160050167107154780F36CeAAB',
    merkleDistributor: '0x07E8291591eaC73Dd93b079e3E68e171094bA9e1',
    roles: '0xFe5947f029308F854db0cDA57e68C43f6C21a207',
    contractChecker: '0x02c75acFd94E124C2696F785e4fcaf8248471FE4',
    whiteListManager: '0x57a9cbED053f37EB67d6f5932b1F2f9Afbe347F3',
  };
}

module.exports = {
  contractSettings,
  contracts,
};
