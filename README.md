# Shared Validator

[![Gitter](https://badges.gitter.im/stakewise/community.svg)](https://gitter.im/stakewise/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![Discord](https://user-images.githubusercontent.com/7288322/34471967-1df7808a-efbb-11e7-9088-ed0b04151291.png)](https://discord.gg/2BSdr2g)

A set of smart contracts, used for sharing an Ethereum 2.0 validator.

- **Extensible:** Abstracts away the logic of sending deposits to Ethereum 2.0 [Deposit Contract](https://github.com/ethereum/eth2.0-specs/tree/dev/deposit_contract), and withdrawing them. By extending the [Base Collector](./contracts/collectors/BaseCollector.sol) contract, it's possible to create your own contract with logic for accumulating validator's deposit amount.
- **Upgradable:** By using [OpenZeppelin SDK](https://github.com/OpenZeppelin/openzeppelin-sdk), it's possible to fix bugs and issues even when the contracts are deployed to the production network.
- **Role-based access:** By having [Operators](./contracts/access/Operators.sol) and [Admins](./contracts/access/Admins.sol) contracts, it is possible to define a set of users capable of registering validators, assigning wallets to finished validators, changing settings, etc.
- **Application friendly:** Any contract state change is always followed by an emitted event. Applications can monitor and act on these events.
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

4. Deploy contracts to the selected network:

   ```shell script
   NETWORK=ropsten INITIAL_ADMIN=<address> VRC=<address> npm run deploy
   ```

   where `NETWORK` is the name of the network from `truffle-config.js`,
   `INITIAL_ADMIN` is the first account capable of calling functions restricted only to admins (see [Admins contract](./contracts/access/Admins.sol)),
   `VRC` is the address of Ethereum 2.0 [Deposit Contract](https://github.com/ethereum/eth2.0-specs/tree/dev/deposit_contract).
   If you are deploying to the test network without `VRC`, you can first call `npm install && npm run deploy-vrc`.

   The network file will be created at `.openzeppelin` directory.

## Documentation

You can find the documentation for every contract in the `contracts` directory. In the future, the documentation will be hosted on a dedicated webpage.

## Contributing

Development of the project happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements.

### License

The project is [GNU GPL v3](./LICENSE.md).
