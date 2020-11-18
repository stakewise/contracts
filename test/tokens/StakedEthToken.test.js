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
  deployStakedEthToken,
  deployRewardEthToken,
  initializeStakedEthToken,
  initializeRewardEthToken,
} = require('../../deployments/tokens');
const { checkStakedEthToken } = require('../utils');

const StakedEthToken = artifacts.require('StakedEthToken');
const Settings = artifacts.require('Settings');

contract('StakedEthToken', ([_, ...accounts]) => {
  let settings, stakedEthToken;
  let [
    poolContractAddress,
    admin,
    balanceReportersContractAddress,
    stakedTokensContractAddress,
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
    const stakedEthTokenContractAddress = await deployStakedEthToken();
    const rewardEthTokenContractAddress = await deployRewardEthToken();
    await initializeStakedEthToken(
      stakedEthTokenContractAddress,
      rewardEthTokenContractAddress,
      settings.address,
      poolContractAddress
    );
    await initializeRewardEthToken(
      rewardEthTokenContractAddress,
      stakedEthTokenContractAddress,
      settings.address,
      balanceReportersContractAddress,
      stakedTokensContractAddress
    );

    stakedEthToken = await StakedEthToken.at(stakedEthTokenContractAddress);
  });

  describe('mint', () => {
    it('anyone cannot mint stETH tokens', async () => {
      await expectRevert(
        stakedEthToken.mint(sender1, ether('10'), {
          from: sender1,
        }),
        'StakedEthToken: permission denied'
      );
      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: new BN(0),
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });
    });

    it('pool can mint stETH tokens', async () => {
      let value = ether('10');
      let receipt = await stakedEthToken.mint(sender1, value, {
        from: poolContractAddress,
      });
      expectEvent(receipt, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
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
      await stakedEthToken.mint(sender1, value, {
        from: poolContractAddress,
      });
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        stakedEthToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'StakedEthToken: transfer to the zero address'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        stakedEthToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'StakedEthToken: transfer from the zero address'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer zero amount', async () => {
      let receipt = await stakedEthToken.transfer(sender2, ether('0'), {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: ether('0'),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await settings.setPausedContracts(stakedEthToken.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakedEthToken.address)).equal(
        true
      );

      await expectRevert(
        stakedEthToken.transfer(sender2, value, {
          from: sender1,
        }),
        'StakedEthToken: contract is paused'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
      await settings.setPausedContracts(stakedEthToken.address, false, {
        from: admin,
      });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        stakedEthToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'StakedEthToken: invalid amount'
      );

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer stETH tokens to different account', async () => {
      let receipt = await stakedEthToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });

      await checkStakedEthToken({
        stakedEthToken,
        totalSupply: value,
        account: sender2,
        balance: value,
        deposit: value,
      });
    });
  });
});
