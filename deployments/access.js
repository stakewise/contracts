const { ethers, upgrades } = require('@nomiclabs/buidler');

async function deployAndInitializeAdmins(initialAdminAddress) {
  const Admins = await ethers.getContractFactory('Admins');
  const proxy = await upgrades.deployProxy(Admins, [initialAdminAddress], {
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function deployAndInitializeOperators(adminsContractAddress) {
  const Operators = await ethers.getContractFactory('Operators');
  const proxy = await upgrades.deployProxy(Operators, [adminsContractAddress], {
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function deployAndInitializeManagers(adminsContractAddress) {
  const Managers = await ethers.getContractFactory('Managers');
  const proxy = await upgrades.deployProxy(Managers, [adminsContractAddress], {
    unsafeAllowCustomTypes: true,
  });
  return proxy.address;
}

async function deployBalanceReporters() {
  const BalanceReporters = await ethers.getContractFactory('BalanceReporters');
  const proxy = await upgrades.deployProxy(BalanceReporters, [], {
    unsafeAllowCustomTypes: true,
    initializer: false,
  });
  return proxy.address;
}

async function initializeBalanceReporters(
  balanceReportersContractAddress,
  adminsContractAddress,
  settingsContractAddress,
  rewardEthTokenContractAddress
) {
  let BalanceReporters = await ethers.getContractFactory('BalanceReporters');
  BalanceReporters = BalanceReporters.attach(balanceReportersContractAddress);

  return BalanceReporters.initialize(
    adminsContractAddress,
    settingsContractAddress,
    rewardEthTokenContractAddress
  );
}

module.exports = {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
  deployAndInitializeManagers,
  deployBalanceReporters,
  initializeBalanceReporters,
};
