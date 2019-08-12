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
      gas: 0xfffffffffff,
      gasPrice: 0x01,
      network_id: '*'
    }
  },
  compilers: {
    solc: {
      version: '0.5.10'
    }
  },
  mocha: {
    reporter: 'eth-gas-reporter',
    currency: 'EUR'
  }
};
