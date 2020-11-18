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
  deployAndInitializeERC20Mock,
  deployStakedTokens,
  initializeStakedTokens,
} = require('../../deployments/tokens');
const { deployTokens } = require('../utils');

const Admins = artifacts.require('Admins');
const Settings = artifacts.require('Settings');
const StakedTokens = artifacts.require('StakedTokens');
const ERC20Mock = artifacts.require('ERC20Mock');

contract('StakedTokens Actions', ([_, ...accounts]) => {
  let settings,
    admins,
    stakedEthToken,
    rewardEthToken,
    stakedTokens,
    token,
    rewardHolders;
  let [
    poolContractAddress,
    admin,
    balanceReportersContractAddress,
    rewardHolder1,
    rewardHolder2,
    rewardHolder3,
    tokenHolder1,
    tokenHolder2,
    tokenHolder3,
    tokenHolder4,
    otherAccount,
  ] = accounts;
  let tokenHolders = [tokenHolder1, tokenHolder2, tokenHolder3, tokenHolder4];
  let stakedBalance = ether('25');

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
    admins = await Admins.at(adminsContractAddress);
  });

  beforeEach(async () => {
    let stakedTokensContractAddress = await deployStakedTokens();
    [rewardEthToken, stakedEthToken] = await deployTokens({
      settings,
      balanceReportersContractAddress,
      stakedTokensContractAddress,
      poolContractAddress,
    });

    stakedTokens = await StakedTokens.at(stakedTokensContractAddress);
    await initializeStakedTokens(
      stakedTokensContractAddress,
      settings.address,
      admins.address,
      rewardEthToken.address
    );

    token = await ERC20Mock.at(
      await deployAndInitializeERC20Mock(admin, 'Token', 'token', '0')
    );

    rewardHolders = [
      token.address,
      rewardHolder1,
      rewardHolder2,
      rewardHolder3,
    ];

    // mint stETH tokens
    for (const holder of rewardHolders) {
      await stakedEthToken.mint(holder, stakedBalance, {
        from: poolContractAddress,
      });
    }

    // mint tokens
    for (const holder of tokenHolders) {
      await token.mint(holder, stakedBalance, {
        from: admin,
      });
    }
  });

  describe('enabling token', () => {
    it('fails to enable when contract is paused', async () => {
      await settings.setPausedContracts(stakedTokens.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

      await expectRevert(
        stakedTokens.toggleTokenContract(token.address, true, {
          from: admin,
        }),
        'StakedTokens: contract is paused'
      );

      await settings.setPausedContracts(stakedTokens.address, false, {
        from: admin,
      });
    });

    it('only admin user can enable token', async () => {
      await expectRevert(
        stakedTokens.toggleTokenContract(token.address, true, {
          from: otherAccount,
        }),
        'StakedTokens: permission denied'
      );
    });

    it('fails to add token with zero address', async () => {
      await expectRevert(
        stakedTokens.toggleTokenContract(constants.ZERO_ADDRESS, true, {
          from: admin,
        }),
        'StakedTokens: invalid token address'
      );
    });

    it('enables token', async () => {
      let receipt = await stakedTokens.toggleTokenContract(
        token.address,
        true,
        {
          from: admin,
        }
      );

      expectEvent(receipt, 'TokenToggled', {
        token: token.address,
        isEnabled: true,
      });
    });
  });

  describe('disabling token', () => {
    it('fails to disable token support when contract is paused', async () => {
      await settings.setPausedContracts(stakedTokens.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

      await expectRevert(
        stakedTokens.toggleTokenContract(token.address, false, {
          from: admin,
        }),
        'StakedTokens: contract is paused'
      );

      await settings.setPausedContracts(stakedTokens.address, false, {
        from: admin,
      });
    });

    it('only admin user can toggle token support', async () => {
      await stakedTokens.toggleTokenContract(token.address, true, {
        from: admin,
      });

      await expectRevert(
        stakedTokens.toggleTokenContract(token.address, false, {
          from: otherAccount,
        }),
        'StakedTokens: permission denied'
      );
    });

    it('admin can disable token support', async () => {
      await stakedTokens.toggleTokenContract(token.address, true, {
        from: admin,
      });

      let receipt = await stakedTokens.toggleTokenContract(
        token.address,
        false,
        {
          from: admin,
        }
      );

      expectEvent(receipt, 'TokenToggled', {
        token: token.address,
        isEnabled: false,
      });
    });
  });

  describe('stake tokens', () => {
    beforeEach(async () => {
      await stakedTokens.toggleTokenContract(token.address, true, {
        from: admin,
      });
    });

    it('fails to stake tokens when contract is paused', async () => {
      await settings.setPausedContracts(stakedTokens.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

      await expectRevert(
        stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
          from: tokenHolder1,
        }),
        'StakedTokens: contract is paused'
      );

      await settings.setPausedContracts(stakedTokens.address, false, {
        from: admin,
      });
    });

    it('fails to stake tokens with invalid contract', async () => {
      await expectRevert(
        stakedTokens.stakeTokens(rewardEthToken.address, stakedBalance, '0', {
          from: tokenHolder1,
        }),
        'StakedTokens: token is not supported'
      );
    });

    it('fails to stake disabled contract tokens', async () => {
      await stakedTokens.toggleTokenContract(token.address, false, {
        from: admin,
      });

      await expectRevert(
        stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
          from: tokenHolder1,
        }),
        'StakedTokens: token is not supported'
      );
    });

    it('fails to stake tokens with insufficient balance', async () => {
      await expectRevert(
        stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
          from: otherAccount,
        }),
        'StakedTokens: invalid tokens amount'
      );
    });

    it('fails to withdraw insufficient rewards', async () => {
      await expectRevert(
        stakedTokens.stakeTokens(token.address, stakedBalance, new BN('1'), {
          from: tokenHolder1,
        }),
        'StakedTokens: cannot update account with negative rewards'
      );
    });

    it('can stake tokens', async () => {
      for (const holder of tokenHolders) {
        await token.approve(stakedTokens.address, stakedBalance, {
          from: holder,
        });

        let receipt = await stakedTokens.stakeTokens(
          token.address,
          stakedBalance,
          '0',
          {
            from: holder,
          }
        );
        expectEvent(receipt, 'TokensStaked', {
          token: token.address,
          account: holder,
          amount: stakedBalance,
        });
      }

      // check that token holders' balances are correct
      for (const holder of tokenHolders) {
        expect(
          await stakedTokens.balanceOf(token.address, holder)
        ).to.bignumber.equal(stakedBalance);
      }
    });
  });

  describe('withdraw tokens', () => {
    beforeEach(async () => {
      await stakedTokens.toggleTokenContract(token.address, true, {
        from: admin,
      });
      for (const holder of tokenHolders) {
        await token.approve(stakedTokens.address, stakedBalance, {
          from: holder,
        });
        await stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
          from: holder,
        });
      }
    });

    it('fails to withdraw tokens when contract is paused', async () => {
      await settings.setPausedContracts(stakedTokens.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

      await expectRevert(
        stakedTokens.withdrawTokens(token.address, stakedBalance, '0', {
          from: tokenHolder1,
        }),
        'StakedTokens: contract is paused'
      );

      await settings.setPausedContracts(stakedTokens.address, false, {
        from: admin,
      });
    });

    it('fails to withdraw tokens with invalid contract', async () => {
      await expectRevert(
        stakedTokens.withdrawTokens(otherAccount, stakedBalance, '0', {
          from: tokenHolder1,
        }),
        'StakedTokens: invalid tokens amount'
      );
    });

    it('fails to withdraw reward for disabled contract', async () => {
      await stakedTokens.toggleTokenContract(token.address, false, {
        from: admin,
      });

      await expectRevert(
        stakedTokens.withdrawTokens(token.address, stakedBalance, ether('1'), {
          from: tokenHolder1,
        }),
        'StakedTokens: token is not supported'
      );
    });

    it('fails to withdraw tokens with insufficient balance', async () => {
      await expectRevert(
        stakedTokens.withdrawTokens(token.address, stakedBalance, '0', {
          from: otherAccount,
        }),
        'StakedTokens: invalid tokens amount'
      );
    });

    it('fails to withdraw insufficient rewards', async () => {
      await expectRevert(
        stakedTokens.withdrawTokens(token.address, stakedBalance, new BN('1'), {
          from: tokenHolder1,
        }),
        'StakedTokens: cannot update account with negative rewards'
      );
    });

    it('can withdraw tokens', async () => {
      for (const holder of tokenHolders) {
        let receipt = await stakedTokens.withdrawTokens(
          token.address,
          stakedBalance,
          '0',
          {
            from: holder,
          }
        );
        expectEvent(receipt, 'TokensWithdrawn', {
          token: token.address,
          account: holder,
          amount: stakedBalance,
        });
      }

      let newBalance = new BN('0');
      // check that token holders' balances are correct
      for (const holder of tokenHolders) {
        expect(
          await stakedTokens.balanceOf(token.address, holder)
        ).to.bignumber.equal(newBalance);
      }
    });

    it('can withdraw tokens from disabled contract', async () => {
      await stakedTokens.toggleTokenContract(token.address, false, {
        from: admin,
      });

      for (const holder of tokenHolders) {
        let receipt = await stakedTokens.withdrawTokens(
          token.address,
          stakedBalance,
          '0',
          {
            from: holder,
          }
        );
        expectEvent(receipt, 'TokensWithdrawn', {
          token: token.address,
          account: holder,
          amount: stakedBalance,
        });
      }

      let newBalance = new BN('0');
      // check that token holders' balances are correct
      for (const holder of tokenHolders) {
        expect(
          await stakedTokens.balanceOf(token.address, holder)
        ).to.bignumber.equal(newBalance);
      }
    });
  });
});
