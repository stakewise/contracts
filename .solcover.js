module.exports = {
  silent: true,
  providerOptions: {
    total_accounts: 5000,
    default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
    gasLimit: 0x1fffffffffffff,
  },
  mocha: {
    timeout: 180000,
  },
  skipFiles: ['mocks', 'tokens/BaseERC20.sol'],
};
