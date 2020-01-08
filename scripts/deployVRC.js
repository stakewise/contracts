const { abi, bytecode } = require('../deployments/vrc');

module.exports = async function(callback) {
  try {
    let vrc = new web3.eth.Contract(abi);
    vrc.setProvider(web3.currentProvider);

    let sender = process.env.FROM || (await web3.eth.getAccounts())[0];
    let gas = await vrc.deploy({ data: bytecode }).estimateGas();

    vrc = await vrc.deploy({ data: bytecode }).send({ from: sender, gas });
    console.log(`VRC deployed at address: ${vrc.options.address}`);
    callback();
  } catch (e) {
    callback(e);
  }
};
