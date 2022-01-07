# StakeWise smart contracts

[![CircleCI](https://circleci.com/gh/stakewise/contracts.svg?style=svg)](https://circleci.com/gh/stakewise/contracts)
[![Discord](https://user-images.githubusercontent.com/7288322/34471967-1df7808a-efbb-11e7-9088-ed0b04151291.png)](https://discord.gg/2BSdr2g)

The StakeWise smart contracts for liquid non-custodial ETH2 staking.

## Documentation

You can find the documentation for every contract in the `contracts` directory. For integration, check the `contracts/interfaces` directory.
The documentation is also available on the [official documentation page](https://docs.stakewise.io/smart-contracts).

## Deployment

**NB!** You would have to define the `initialize` function for the contracts that don't have it when deploying for the first time.

1. Install dependencies:

   ```shell script
   yarn install
   ```

2. Compile optimized contracts:

   ```shell script
   yarn compile --optimizer
   ```

3. Update network parameters in `hardhat.config.js`. Learn more at [Hardhat config options](https://hardhat.org/config/).

4. Change [settings](./deployments/settings.js) if needed. 

5. Deploy StakeWise contracts to the selected network:

   ```shell script
   yarn deploy-contracts --network rinkeby
   ```

## Contributing

Development of the project happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements.

### License

The project is [GNU AGPL v3](./LICENSE).
