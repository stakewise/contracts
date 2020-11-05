const { expect } = require('chai');
const {
  expectRevert,
  expectEvent,
  BN,
  ether,
  constants,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
} = require('../../deployments/access');
const { deployAndInitializeSettings } = require('../../deployments/settings');
const {
  deployStakingEthToken,
  deployRewardEthToken,
  initializeStakingEthToken,
  initializeRewardEthToken,
} = require('../../deployments/tokens');
const { checkStakingEthToken } = require('../utils');

const StakingEthToken = artifacts.require('StakingEthToken');
const Settings = artifacts.require('Settings');

contract('StakingEthToken', ([_, ...accounts]) => {
  let settings, stakingEthToken;
  let [
    poolContractAddress,
    admin,
    balanceReportersContractAddress,
    sender1,
    sender2,
  ] = accounts;

  before(async () => {
    let adminsContractAddress = await deployAndInitializeAdmins(admin);
    let operatorsContractAddress = await deployAndInitializeOperators(
      adminsContractAddress
    );
    settings = await Settings.at(
      await deployAndInitializeSettings(
        adminsContractAddress,
        operatorsContractAddress
      )
    );
  });

  beforeEach(async () => {
    const stakingEthTokenContractAddress = await deployStakingEthToken();
    const rewardEthTokenContractAddress = await deployRewardEthToken();
    await initializeStakingEthToken(
      stakingEthTokenContractAddress,
      rewardEthTokenContractAddress,
      settings.address,
      poolContractAddress
    );
    await initializeRewardEthToken(
      rewardEthTokenContractAddress,
      stakingEthTokenContractAddress,
      settings.address,
      balanceReportersContractAddress
    );

    stakingEthToken = await StakingEthToken.at(stakingEthTokenContractAddress);
  });

  describe('mint', () => {
    it('anyone cannot mint stETH tokens', async () => {
      await expectRevert(
        stakingEthToken.mint(sender1, ether('10'), {
          from: sender1,
        }),
        'StakingEthToken: permission denied'
      );
      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: new BN(0),
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });
    });

    it('pool can mint stETH tokens', async () => {
      let value = ether('10');
      let receipt = await stakingEthToken.mint(sender1, value, {
        from: poolContractAddress,
      });
      expectEvent(receipt, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value,
      });

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });
  });

  describe('transfer', () => {
    let value = ether('10');

    beforeEach(async () => {
      await stakingEthToken.mint(sender1, value, {
        from: poolContractAddress,
      });
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        stakingEthToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'StakingEthToken: transfer to the zero address'
      );

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        stakingEthToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'StakingEthToken: transfer from the zero address'
      );

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer zero amount', async () => {
      await expectRevert(
        stakingEthToken.transfer(sender2, ether('0'), {
          from: sender1,
        }),
        'StakingEthToken: invalid amount'
      );

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await settings.setPausedContracts(stakingEthToken.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakingEthToken.address)).equal(
        true
      );

      await expectRevert(
        stakingEthToken.transfer(sender2, value, {
          from: sender1,
        }),
        'StakingEthToken: contract is paused'
      );

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
      await settings.setPausedContracts(stakingEthToken.address, false, {
        from: admin,
      });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        stakingEthToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'StakingEthToken: invalid amount'
      );

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer stETH tokens to different account', async () => {
      let receipt = await stakingEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });

      await checkStakingEthToken({
        stakingEthToken,
        totalSupply: value,
        account: sender2,
        balance: value,
        deposit: value,
      });
    });
  });
});
