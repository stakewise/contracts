module.exports = async function(cb) {
  let accounts = await web3.eth.getAccounts();
  let amount = process.env.AMOUNT || '100000000000000000000';
  let sender = process.env.FROM || accounts[0];
  web3.eth.sendTransaction(
    { from: sender, to: process.env.TO, value: amount },
    cb
  );
};
