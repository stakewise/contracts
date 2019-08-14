const { getVRC } = require('../deployments/vrc');

module.exports = async callback => {
  try {
    let vrc = await getVRC();
    vrc.setProvider(web3.currentProvider);
    let sender = process.env.FROM || (await web3.eth.getAccounts())[0];
    let address = (await vrc.new({ from: sender })).address;
    console.log(`VRC deployed at address: ${address}`);
    callback();
  } catch (e) {
    callback(e);
  }
};
