module.exports = {
  silent: true,
  providerOptions: {
    total_accounts: 5000,
    default_balance_ether: 1000000000000000000000000, // extra zero just in case (coverage consumes more gas)
    gasLimit: 0x1fffffffffffff,
  },
  mocha: {
    timeout: 1000000,
  },
  skipFiles: [
    'mocks',
    'tokens/ERC20Upgradeable.sol',
    'tokens/ERC20PermitUpgradeable.sol',
    'tokens/EIP712Upgradeable.sol',
    'libraries/ECDSA.sol',
  ],
};
