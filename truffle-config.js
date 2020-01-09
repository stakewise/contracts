module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*'
    },
    coverage: {
      host: 'localhost',
      port: 8555,
      network_id: '*'
    }
  },
  compilers: {
    solc: {
      version: '0.5.15',
      optimizer: {
        enabled: true,
        runs: 10000
      }
    }
  },
  plugins: ['solidity-coverage'],
  mocha: {
    reporter: 'eth-gas-reporter',
    currency: 'EUR'
  }
};
