const { task, extendEnvironment } = require('hardhat/config');
const { gray, yellow } = require('chalk');

require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('hardhat-abi-exporter');
require('@nomiclabs/hardhat-etherscan');

const GAS_PRICE = 20e9; // 20 Gwei
const BLOCK_NUMBER = 12780550;
const OPTIMIZER_RUNS = 5000000;
const log = (...text) => console.log(gray(...['└─> [DEBUG]'].concat(text)));

extendEnvironment((hre) => {
  hre.log = log;
});

function optimizeIfRequired({ hre, taskArguments: { optimizer } }) {
  if (optimizer || hre.optimizer) {
    // only show message once if re-run
    if (hre.optimizer === undefined) {
      log(gray('Adding optimizer, runs', yellow(OPTIMIZER_RUNS.toString())));
    }

    // Use optimizer (slower) but simulates real contract size limits and gas usage
    hre.config.solidity.compilers[0].settings.optimizer = {
      enabled: true,
      runs: OPTIMIZER_RUNS,
    };
    hre.config.networks.hardhat.allowUnlimitedContractSize = false;
  } else {
    if (hre.optimizer === undefined) {
      log(gray('Optimizer disabled. Unlimited contract sizes allowed.'));
    }
    hre.config.solidity.compilers[0].settings.optimizer = { enabled: false };
    hre.config.networks.hardhat.allowUnlimitedContractSize = true;
  }

  // flag here so that if invoked via "hardhat test" the argument will persist to the compile stage
  hre.optimizer = !!optimizer;
}

task('compile')
  .addFlag('optimizer', 'Compile with the optimizer')
  .setAction(async (taskArguments, hre, runSuper) => {
    optimizeIfRequired({ hre, taskArguments });
    await runSuper(taskArguments);
  });

task('test')
  .addFlag('optimizer', 'Compile with the optimizer')
  .addFlag('gas', 'Compile gas usage')
  .addOptionalParam('grep', 'Filter tests to only those with given logic')
  .setAction(async (taskArguments, hre, runSuper) => {
    const { gas, grep } = taskArguments;

    optimizeIfRequired({ hre, taskArguments });

    if (grep) {
      console.log(gray('Filtering tests to those containing'), yellow(grep));
      hre.config.mocha.grep = grep;
    }

    log(
      gray('Mainnet fork with block number', yellow(BLOCK_NUMBER.toString()))
    );

    if (gas) {
      console.log(
        gray(`Enabling ${yellow('gas')} reports, tests will run slower`)
      );
      hre.config.gasReporter.enabled = true;
      hre.config.mocha.timeout = 180000;
    }

    // suppress logs for tests
    hre.config.suppressLogs = true;

    await runSuper(taskArguments);
  });

task('coverage').setAction(async (taskArguments, hre, runSuper) => {
  log(gray('Mainnet fork with block number', yellow(BLOCK_NUMBER.toString())));

  await runSuper(taskArguments);
});

task('verify')
  .addFlag('optimizer', 'Compile with the optimizer')
  .setAction(async (taskArguments, hre, runSuper) => {
    optimizeIfRequired({ hre, taskArguments });
    await runSuper(taskArguments);
  });

module.exports = {
  solidity: {
    version: '0.7.5',
  },
  networks: {
    hardhat: {
      blockGasLimit: 0x1fffffffffffff,
      gasPrice: GAS_PRICE,
      allowUnlimitedContractSize: true,
      forking: {
        url: process.env.HARDHAT_FORK_API_URL,
        blockNumber: BLOCK_NUMBER,
      },
    },
    local: {
      url: 'http://localhost:8545',
      blockGasLimit: 0x1fffffffffffff,
      gasPrice: GAS_PRICE,
      allowUnlimitedContractSize: true,
    },
  },
  throwOnTransactionFailures: true,
  gasReporter: {
    enabled: false,
    showTimeSpent: true,
    currency: 'USD',
    maxMethodDiff: 25, // CI will fail if gas usage is > than this %
    excludeContracts: ['mocks/'],
  },
  abiExporter: {
    path: './abi',
    only: [
      'AccessControl',
      'Oracles',
      'IDepositContract',
      'IERC20Upgradeable',
      'Pool',
      'RewardEthToken',
      'Solos',
      'StakedEthToken',
      'StakeWiseToken',
      'Validators',
      'VestingEscrow',
      'VestingEscrowFactory',
      'PoolEscrow',
      'MerkleDrop',
      'MerkleDistributor',
      'SwiseStaking',
    ],
    clear: true,
    flat: true,
  },
  etherscan: {
    apiKey: 'api key goes here',
  },
};
