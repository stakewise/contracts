# StakeWise smart contracts

[![CircleCI](https://circleci.com/gh/stakewise/contracts.svg?style=svg)](https://circleci.com/gh/stakewise/contracts)
[![CodeCov](https://codecov.io/gh/stakewise/contracts/branch/master/graph/badge.svg)](https://codecov.io/gh/stakewise/contracts)
[![Discord](https://user-images.githubusercontent.com/7288322/34471967-1df7808a-efbb-11e7-9088-ed0b04151291.png)](https://discord.gg/2BSdr2g)

The StakeWise smart contracts for tokenized staking and non-custodial validators.

- **Extensible:** It is possible to create your own contract with logic for accumulating validator deposit amount.
- **Upgradable:** By using [OpenZeppelin Upgrades](https://github.com/OpenZeppelin/openzeppelin-upgrades), it's possible to fix bugs and critical issues when the contracts are deployed to the production network.
- **Role-based access:** By having [Operators](./contracts/access/Operators.sol), [Admins](./contracts/access/Admins.sol), and [Managers](./contracts/access/Managers.sol) contracts, it is possible to restrict user capabilities.
- **Integration friendly:** Any contract state change is always followed by an emitted event. Applications can monitor and act on these events.
- **Configurable:** Any global setting can be managed through the separate [Settings](./contracts/Settings.sol) contract.

## Deployment

1. Install dependencies:

   ```shell script
   yarn install
   ```

2. Compile optimized contracts:

   ```shell script
   yarn compile --optimizer
   ```

3. Define network parameters in `hardhat.config.js`. Learn more at [Hardhat config options](https://hardhat.org/config/).

4. Change [initial settings](./deployments/settings.js) accordingly.

5. If you are deploying to the network without [ETH2 deposit contract](https://github.com/ethereum/eth2.0-specs/tree/dev/solidity_deposit_contract), run the following commands:

   ```shell script
   yarn deployVRC --network rinkeby
   ```

6. If you are deploying to the network without `DAI contract`, run the following commands:

   ```shell script
   yarn deployDAI --network rinkeby
   ```

7. Deploy StakeWise contracts to the selected network:

   ```shell script
   yarn deploy --network rinkeby
   ```

## Documentation

You can find the documentation for every contract in the `contracts` directory. In the future, the documentation will be hosted on a dedicated webpage.

## Contributing

Development of the project happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements.

### License

The project is [GNU AGPL v3](./LICENSE).
