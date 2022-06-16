# StakeWise smart contracts

[![CircleCI](https://circleci.com/gh/stakewise/contracts.svg?style=svg)](https://circleci.com/gh/stakewise/contracts)
[![Discord](https://user-images.githubusercontent.com/7288322/34471967-1df7808a-efbb-11e7-9088-ed0b04151291.png)](https://discord.gg/2BSdr2g)

The [StakeWise](https://stakewise.io/) smart contracts for liquid non-custodial ETH2 staking.

Check our [Harbour contracts](https://github.com/stakewise/contracts/tree/harbour) for custodial ETH2 staking.

We also support GNO staking. Check [contracts for gnosis chain](https://github.com/stakewise/contracts/tree/gnosis-chain).

# Audits and bug bounty
All audit reports are presented in the [audits folder](https://github.com/stakewise/contracts/tree/master/audits)

Feel free to join our [bug bounty program](https://immunefi.com/bounty/stakewise/)

## Documentation

You can find the documentation for every contract in the `contracts` directory. For integration, check the `contracts/interfaces` directory.
The documentation is also available on the [official documentation page](https://docs.stakewise.io/smart-contracts).

#### Pool
The Pool contract is an entry point for deposits into the StakeWise Pool. This contract stores ETH collected from the users before it is sent to the ETH2 Validator Registration Contract. 

#### StakedEthToken
The StakedEthToken is an ERC-20 contract. It reflects the deposits made by the stakers in the form of sETH2 tokens. The tokens are mapped 1 to 1 to ETH. 
The total supply of sETH2 is the sum of all the StakeWise Pool's validators' effective balances, plus an additional amount of up to (32 ETH - 1 Wei) ETH awaiting inclusion into a new validator. 

#### RewardEthToken
The RewardEthToken is an ERC-20 contract. It reflects the rewards accumulated by the stakers in the form of rETH2 tokens. The tokens are mapped 1 to 1 to ETH. 
The total supply of rETH2 is the amount that is above the effective balance of all the validators registered for the StakeWise Pool. 

#### Oracle
Oracles contract stores accounts responsible for submitting or updating values based on the off-chain data.

## Deployments

### Mainnet

- Pool: [0xe68E649862F7036094f1E4eD5d69a738aCDE666f](https://etherscan.io/address/0xe68E649862F7036094f1E4eD5d69a738aCDE666f)
- Pool Escrow: [0x2296e122c1a20Fca3CAc3371357BdAd3be0dF079](https://etherscan.io/address/0x2296e122c1a20Fca3CAc3371357BdAd3be0dF079)
- Pool Validators: [0x002932e11E95DC84C17ed5f94a0439645D8a97BC](https://etherscan.io/address/0x002932e11E95DC84C17ed5f94a0439645D8a97BC)
- StakedEthToken: [0x41bcac23e4db058d8D7aAbE2Fccdae5F01FE647A](https://etherscan.io/address/0x41bcac23e4db058d8D7aAbE2Fccdae5F01FE647A)
- RewardEthToken: [0x7cA75ccf264b2d9F91D4ABA7639fC7FcC73a7e09](https://etherscan.io/address/0x7cA75ccf264b2d9F91D4ABA7639fC7FcC73a7e09)
- StakeWiseToken: [0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2](https://etherscan.io/address/0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2)
- Oracles: [0x8a887282E67ff41d36C0b7537eAB035291461AcD](https://etherscan.io/address/0x8a887282E67ff41d36C0b7537eAB035291461AcD)
- Vesting Escrow: [0x1E6d872CE26C8711e7D47b8E0C47aB91d95a6dF3](https://etherscan.io/address/0x1E6d872CE26C8711e7D47b8E0C47aB91d95a6dF3)
- Vesting Escrow Factory: [0xbeE3Eb97Cfd94ace6B66E606B8088C57c5f78fBf](https://etherscan.io/address/0xbeE3Eb97Cfd94ace6B66E606B8088C57c5f78fBf)
- Dao Module: [0xB5cF5363c3e766e64B37b2fB9554bFE8D48ED1A0](https://etherscan.io/address/0xB5cF5363c3e766e64B37b2fB9554bFE8D48ED1A0)
- Merkle Distributor: [0x1d873651c38D912c8A7E1eBfB013Aa96bE5AACBC](https://etherscan.io/address/0x1d873651c38D912c8A7E1eBfB013Aa96bE5AACBC)
- Roles: [0xC486c10e3611565F5b38b50ad68277b11C889623](https://etherscan.io/address/0xC486c10e3611565F5b38b50ad68277b11C889623)
- Early Adopters Campaign (Merkle Drop): [0x2AAB6822a1a9f982fd7b0Fe35A5A5b6148eCf4d5](https://etherscan.io/address/0x2AAB6822a1a9f982fd7b0Fe35A5A5b6148eCf4d5)
- Contract Checker: [0x85ee326f839Bc430655A3fad447837072ef52C2F](https://etherscan.io/address/0xfc1fc7257aea7c7c08a498594dca97ce5a72fdcb)
- Proxy Admin: [0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22](https://etherscan.io/address/0x3EB0175dcD67d3AB139aA03165e24AA2188A4C22)

Check more details and previous versions at https://github.com/stakewise/contracts/blob/master/networks/mainnet.md 

### Goerli testnet

- Pool: [0x6931a7A2B196386005a3E1F9752542227d4f4d64](https://goerli.etherscan.io/address/0x6931a7A2B196386005a3E1F9752542227d4f4d64)
- Pool Escrow: [0x040F15C6b5Bfc5F324eCaB5864C38D4e1EEF4218](https://goerli.etherscan.io/address/0x040f15c6b5bfc5f324ecab5864c38d4e1eef4218)
- Pool Validators: [0x3A2A4c01BC8595E168A90bA6F04BB8A9FEac2acb](https://goerli.etherscan.io/address/0x3A2A4c01BC8595E168A90bA6F04BB8A9FEac2acb)
- StakedEthToken: [0x221D9812823DBAb0F1fB40b0D294D9875980Ac19](https://goerli.etherscan.io/address/0x221D9812823DBAb0F1fB40b0D294D9875980Ac19)
- RewardEthToken: [0x45E444930236De8548CAe187C2CD0BbDE73f5e13](https://goerli.etherscan.io/address/0x45E444930236De8548CAe187C2CD0BbDE73f5e13)
- StakeWiseToken: [0x0e2497aACec2755d831E4AFDEA25B4ef1B823855](https://goerli.etherscan.io/address/0x0e2497aACec2755d831E4AFDEA25B4ef1B823855)
- Oracles: [0x531b9D9cb268E88D53A87890699bbe31326A6f08](https://goerli.etherscan.io/address/0x531b9D9cb268E88D53A87890699bbe31326A6f08)
- Vesting Escrow: [0x4CDAe3f1Eaa84b88fFc97627Ef1c77F762794287](https://goerli.etherscan.io/address/0x4CDAe3f1Eaa84b88fFc97627Ef1c77F762794287)
- Vesting Escrow Factory: [0x1BBf89F4Dc9913FCC14EF5A336A1d8C23Ccb74E3](https://goerli.etherscan.io/address/0x1BBf89F4Dc9913FCC14EF5A336A1d8C23Ccb74E3)
- Early Adopters Campaign (Merkle Drop): [0xFc3513E92799F0169e5f14F354d0097E4b790498](https://goerli.etherscan.io/address/0xFc3513E92799F0169e5f14F354d0097E4b790498)
- Merkle Distributor: [0x3022648376AfBf1f716111a256221043b7a03c1f](https://goerli.etherscan.io/address/0x3022648376AfBf1f716111a256221043b7a03c1f)
- Roles: [0x81aaa59d7d1000A56326Bb577DEbc287Cbd351cC](https://goerli.etherscan.io/address/0x81aaa59d7d1000A56326Bb577DEbc287Cbd351cC)
- Contract Checker: [0x85ee326f839Bc430655A3fad447837072ef52C2F](https://goerli.etherscan.io/address/0x85ee326f839Bc430655A3fad447837072ef52C2F)
- Proxy Admin: [0xbba3f4dDD4F705aD2028ee2da64fF3166bDe8cA8](https://goerli.etherscan.io/address/0xbba3f4dDD4F705aD2028ee2da64fF3166bDe8cA8)

Check more details and previous versions at https://github.com/stakewise/contracts/blob/master/networks/goerli.md 

## Development

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

Development of the project happens in the open on GitHub, and we are grateful to the community for contributing bug fixes and improvements.


## Contact us

- [Discord](https://chat.stakewise.io/) 
- [Telegram](https://t.me/stakewise_io) 
- [Twitter](https://twitter.com/stakewise_io) 

### License

The project is [GNU AGPL v3](./LICENSE).
