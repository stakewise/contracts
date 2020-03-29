module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      networkCheckTimeout: 10000000,
    },
    coverage: {
      host: 'localhost',
      port: 8555,
      network_id: '*',
    },
  },
  compilers: {
    solc: {
      version: '0.6.4',
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  plugins: ['solidity-coverage'],
  // FIXME: https://github.com/cgewecke/eth-gas-reporter/issues/191
  mocha: {
    reporter: 'eth-gas-reporter',
    currency: 'EUR',
  },
};
