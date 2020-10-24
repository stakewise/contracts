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

async function deployValidatorsOracle() {
  const ValidatorsOracle = await ethers.getContractFactory('ValidatorsOracle');
  const proxy = await upgrades.deployProxy(ValidatorsOracle, [], {
    unsafeAllowCustomTypes: true,
    initializer: false,
  });
  return proxy.address;
}

async function initializeValidatorsOracle(
  validatorsOracleContractAddress,
  adminsContractAddress,
  settingsContractAddress,
  swrTokenContractAddress
) {
  let ValidatorsOracle = await ethers.getContractFactory('ValidatorsOracle');
  ValidatorsOracle = ValidatorsOracle.attach(validatorsOracleContractAddress);

  return ValidatorsOracle.initialize(
    adminsContractAddress,
    settingsContractAddress,
    swrTokenContractAddress
  );
}

module.exports = {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
  deployAndInitializeManagers,
  deployValidatorsOracle,
  initializeValidatorsOracle,
};
