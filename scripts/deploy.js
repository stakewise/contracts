const { ConfigManager, scripts, stdout } = require('@openzeppelin/cli');
const { Loggy } = require('@openzeppelin/upgrades');

// TODO: Replace with actual values
const initialSettings = {
  userDepositMinUnit: '1000000000000000',
  validatorDepositAmount: '32000000000000000000',
  maintainerFee: '523', // 5.23%,
  maintainer: '0xF4904844B4aF87f4036E77Ad1697bEcf703c8439',
  withdrawalCredentials:
    '0x2222222222222222222222222222222222222222222222222222222222222222'
};
const initialAdmin = '0xDD038cA29523F8872C641D585DFE493491c9bF13';

stdout.silent(true);
Loggy.silent(true);

class EthStakes {
  constructor({ admin = initialAdmin, network = 'development' } = {}) {
    this.admin = admin;
    this.network = process.env.NETWORK || network;
  }

  log(message) {
    if (process.env.SILENT !== 'true') {
      console.log(message);
    }
  }

  async initNetworkConfig() {
    if (this.networkConfig) return this.networkConfig;
    this.networkConfig = await ConfigManager.initNetworkConfiguration({
      network: this.network
    });

    this.log(`Initialized session on network "${this.networkConfig.network}"`);
    return this.networkConfig;
  }

  async pushLogicContracts() {
    if (this.logicContractsPushed) return;
    await this.initNetworkConfig();
    await scripts.push({
      deployProxyAdmin: true,
      ...this.networkConfig
    });
    this.logicContractsPushed = true;
  }

  async deployAdminsContract() {
    if (this.adminsAddress) return this.adminsAddress;
    await this.pushLogicContracts();

    // Deploy proxy
    const proxy = await scripts.create({
      contractAlias: 'Admins',
      methodName: 'initialize',
      methodArgs: [this.admin],
      ...this.networkConfig
    });
    this.adminsAddress = proxy.address;

    this.log(`Admins contract: ${this.adminsAddress}`);
    return this.adminsAddress;
  }

  async deployOperatorsContract() {
    if (this.operatorsAddress) return this.operatorsAddress;
    await this.pushLogicContracts();

    // Deploy dependencies
    await this.deployAdminsContract();

    // Deploy proxy
    const proxy = await scripts.create({
      contractAlias: 'Operators',
      methodName: 'initialize',
      methodArgs: [this.adminsAddress],
      ...this.networkConfig
    });
    this.operatorsAddress = proxy.address;

    this.log(`Operators contract: ${this.adminsAddress}`);
    return this.operatorsAddress;
  }

  async deploySettingsContract() {
    if (this.settingsAddress) return this.settingsAddress;
    await this.pushLogicContracts();

    // Deploy dependencies
    await this.deployAdminsContract();

    // Deploy proxy
    const proxy = await scripts.create({
      contractAlias: 'Settings',
      methodName: 'initialize',
      methodArgs: [
        initialSettings.maintainer,
        initialSettings.maintainerFee,
        initialSettings.userDepositMinUnit,
        initialSettings.validatorDepositAmount,
        initialSettings.withdrawalCredentials,
        this.adminsAddress
      ],
      ...this.networkConfig
    });
    this.settingsAddress = proxy.address;

    this.log(`Settings contract: ${this.settingsAddress}`);
    return this.settingsAddress;
  }
}

module.exports.EthStakes = EthStakes;
module.exports.initialSettings = initialSettings;
