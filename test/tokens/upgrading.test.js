const { expectRevert, send, ether } = require('@openzeppelin/test-helpers');
const { contractSettings, contracts } = require('../../deployments/settings');
const { upgradeContracts } = require('../../deployments');
const {
  impersonateAccount,
  stopImpersonatingAccount,
  resetFork,
} = require('../utils');

const RewardEthToken = artifacts.require('RewardEthToken');

contract('RewardEthToken (upgrading)', ([anyone]) => {
  let admin = contractSettings.admin;
  let rewardEthToken, oracles, partnersRevenueSharing, operatorsRevenueSharing;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    ({ oracles, partnersRevenueSharing, operatorsRevenueSharing } =
      await upgradeContracts());
  });

  afterEach(async () => resetFork());

  it('fails to upgrade with not admin privilege', async () => {
    await expectRevert(
      rewardEthToken.upgrade(
        oracles,
        operatorsRevenueSharing,
        partnersRevenueSharing,
        {
          from: anyone,
        }
      ),
      'OwnablePausable: access denied'
    );
  });

  it('fails to upgrade when not paused', async () => {
    await expectRevert(
      rewardEthToken.upgrade(
        oracles,
        operatorsRevenueSharing,
        partnersRevenueSharing,
        {
          from: admin,
        }
      ),
      'Pausable: not paused'
    );
  });

  it('fails to upgrade twice', async () => {
    await rewardEthToken.pause({ from: admin });
    await expectRevert(
      rewardEthToken.upgrade(
        oracles,
        operatorsRevenueSharing,
        partnersRevenueSharing,
        {
          from: admin,
        }
      ),
      'RewardEthToken: already upgraded'
    );
  });
});
