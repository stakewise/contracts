const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const {
  getNetworkConfig,
  deployLogicContracts,
} = require('../deployments/common');
const { deployValidatorsProxy } = require('../deployments/validators');
const { removeNetworkFile } = require('./common/utils');

const Validators = artifacts.require('Validators');

const publicKey =
  '0xb07ef3635f585b5baeb057a45e7337ab5ba2b1205b43fac3a46e0add8aab242b0fb35a54373ad809405ca05c9cbf34c7';

contract('Validators', ([_, pool, solos, groups, anyone]) => {
  let networkConfig, validators, vrc, dai, settings, validatorId;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    validators = await Validators.at(
      await deployValidatorsProxy({
        networkConfig,
        poolProxy: pool,
        solosProxy: solos,
        groupsProxy: groups,
      })
    );
  });

  it('only collectors can register validators', async () => {
    await expectRevert(
      validators.register(
        web3.utils.fromAscii('\x11'.repeat(48)),
        web3.utils.soliditySha3('collector', 1),
        {
          from: anyone,
        }
      ),
      'Validators: permission denied'
    );

    let entityId = web3.utils.soliditySha3('collector', 1);
    let receipt = await validators.register(publicKey, entityId, {
      from: solos,
    });
    expectEvent(receipt, 'ValidatorRegistered', {
      entityId,
      pubKey: publicKey,
    });
  });
});
