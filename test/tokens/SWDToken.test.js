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
  deploySWDToken,
  deploySWRToken,
  initializeSWDToken,
  initializeSWRToken,
} = require('../../deployments/tokens');
const { checkSWDToken } = require('../utils');

const SWDToken = artifacts.require('SWDToken');
const Settings = artifacts.require('Settings');

contract('SWDToken', ([_, ...accounts]) => {
  let settings, swdToken;
  let [
    poolContractAddress,
    admin,
    validatorsOracleContractAddress,
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
    const swdTokenContractAddress = await deploySWDToken();
    const swrTokenContractAddress = await deploySWRToken();
    await initializeSWDToken(
      swdTokenContractAddress,
      swrTokenContractAddress,
      settings.address,
      poolContractAddress
    );
    await initializeSWRToken(
      swrTokenContractAddress,
      swdTokenContractAddress,
      settings.address,
      validatorsOracleContractAddress
    );

    swdToken = await SWDToken.at(swdTokenContractAddress);
  });

  describe('mint', () => {
    it('anyone cannot mint SWD tokens', async () => {
      await expectRevert(
        swdToken.mint(sender1, ether('10'), {
          from: sender1,
        }),
        'SWDToken: permission denied'
      );
      await checkSWDToken({
        swdToken,
        totalSupply: new BN(0),
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });
    });

    it('pool can mint SWD tokens', async () => {
      let value = ether('10');
      let receipt = await swdToken.mint(sender1, value, {
        from: poolContractAddress,
      });
      expectEvent(receipt, 'Transfer', {
        from: constants.ZERO_ADDRESS,
        to: sender1,
        value,
      });

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });
  });

  describe('burn', () => {
    let value = ether('10');

    beforeEach(async () => {
      await swdToken.mint(sender1, value, {
        from: poolContractAddress,
      });
    });

    it('anyone cannot burn SWD tokens', async () => {
      await expectRevert(
        swdToken.burn(sender1, value, {
          from: sender1,
        }),
        'SWDToken: permission denied'
      );
      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot burn more than SWD balance', async () => {
      await expectRevert(
        swdToken.burn(sender1, value.add(ether('1')), {
          from: poolContractAddress,
        }),
        'SWDToken: burn amount exceeds balance'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('pool can burn SWD tokens', async () => {
      let receipt = await swdToken.burn(sender1, value, {
        from: poolContractAddress,
      });
      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: constants.ZERO_ADDRESS,
        value,
      });

      await checkSWDToken({
        swdToken,
        totalSupply: new BN(0),
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });
    });
  });

  describe('transfer', () => {
    let value = ether('10');

    beforeEach(async () => {
      await swdToken.mint(sender1, value, {
        from: poolContractAddress,
      });
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        swdToken.transfer(constants.ZERO_ADDRESS, value, {
          from: sender1,
        }),
        'SWDToken: transfer to the zero address'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        swdToken.transferFrom(constants.ZERO_ADDRESS, sender2, value, {
          from: sender1,
        }),
        'SWDToken: transfer from the zero address'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer zero amount', async () => {
      await expectRevert(
        swdToken.transfer(sender2, ether('0'), {
          from: sender1,
        }),
        'SWDToken: invalid amount'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await settings.setPausedContracts(swdToken.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(swdToken.address)).equal(true);

      await expectRevert(
        swdToken.transfer(sender2, value, {
          from: sender1,
        }),
        'SWDToken: contract is disabled'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
      await settings.setPausedContracts(swdToken.address, false, {
        from: admin,
      });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        swdToken.transfer(sender2, value.add(ether('1')), {
          from: sender1,
        }),
        'SWDToken: invalid amount'
      );

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: value,
        deposit: value,
      });
    });

    it('can transfer SWD tokens to different account', async () => {
      let receipt = await swdToken.transfer(sender2, value, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value,
      });

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });

      await checkSWDToken({
        swdToken,
        totalSupply: value,
        account: sender2,
        balance: value,
        deposit: value,
      });
    });
  });
});
