# StakeWise smart contracts

[![CircleCI](https://circleci.com/gh/stakewise/contracts.svg?style=svg)](https://circleci.com/gh/stakewise/contracts)
[![CodeCov](https://codecov.io/gh/stakewise/contracts/branch/master/graph/badge.svg)](https://codecov.io/gh/stakewise/contracts)
[![Discord](https://user-images.githubusercontent.com/7288322/34471967-1df7808a-efbb-11e7-9088-ed0b04151291.png)](https://discord.gg/2BSdr2g)

The StakeWise smart contracts for provisioning Ethereum 2.0 Validators.

- **Extensible:** It is possible to create your own contract with logic for accumulating validator deposit amount.
- **Upgradable:** By using [OpenZeppelin SDK](https://github.com/OpenZeppelin/openzeppelin-sdk), it's possible to fix bugs and critical issues when the contracts are deployed to the production network.
- **Role-based access:** By having [Operators](./contracts/access/Operators.sol), [Admins](./contracts/access/Admins.sol), and [Wallets Managers](./contracts/access/WalletsManagers.sol) contracts, it is possible to restrict user capabilities.
- **Integration friendly:** Any contract state change is always followed by an emitted event. Applications can monitor and act on these events.
- **Configurable:** Any global setting can be managed through the separate [Settings](./contracts/Settings.sol) contract.

## Deployment

1. Install dependencies:

   ```shell script
   npm install --prod
   ```

2. Compile contracts:

   ```shell script
   npm run compile
   ```

3. Define network parameters in `truffle-config.js`. For example:

   ```javascript
   module.exports = {
     networks: {
       ropsten: {
         provider: function() {
           return new HDWalletProvider(
             mnemonic,
             'https://ropsten.infura.io/v3/YOUR-PROJECT-ID'
           );
         },
         network_id: '3'
       }
     }
   };
   ```

4. If you are deploying to the network without `VRC`, run the following commands:

   ```shell script
   npm install
   node_modules/.bin/truffle exec scripts/deployVRC.js --network ropsten
   ```

5. Deploy contracts to the selected network:

   ```shell script
   NETWORK=ropsten INITIAL_ADMIN=<address> VRC=<address> npm run deploy
   ```

   where `NETWORK` is the name of the network from `truffle-config.js`,
   `INITIAL_ADMIN` is the first account capable of calling functions restricted only to admins (see [Admins contract](./contracts/access/Admins.sol)),
   `VRC` is the address of Ethereum 2.0 [Deposit Contract](https://github.com/ethereum/eth2.0-specs/tree/dev/deposit_contract).

   The network file will be created at `.openzeppelin` directory.

## Documentation

You can find the documentation for every contract in the `contracts` directory. In the future, the documentation will be hosted on a dedicated webpage.

## Contributing

Development of the project happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements.

### License

The project is [GNU GPL v3](./LICENSE.md).
