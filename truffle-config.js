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
      version: '0.6.12',
      optimizer: {
        enabled: true,
        runs: 10000000,
      },
    },
  },
  plugins: ['solidity-coverage'],
  mocha: {
    reporter: 'eth-gas-reporter',
    currency: 'EUR',
  },
};
