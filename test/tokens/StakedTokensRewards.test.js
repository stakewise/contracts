const { expect } = require('chai');
const {
  BN,
  ether,
  expectRevert,
  expectEvent,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
} = require('../../deployments/access');
const {
  deployAndInitializeSettings,
  initialSettings,
} = require('../../deployments/settings');
const {
  deployAndInitializeERC20Mock,
  deployStakedTokens,
  initializeStakedTokens,
} = require('../../deployments/tokens');
const { deployTokens, checkRewardEthToken } = require('../utils');

const Admins = artifacts.require('Admins');
const Settings = artifacts.require('Settings');
const StakedTokens = artifacts.require('StakedTokens');
const ERC20Mock = artifacts.require('ERC20Mock');

const maintainerFee = new BN(initialSettings.maintainerFee);

contract('StakedTokens Rewards', ([_, ...accounts]) => {
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
    rewardsHolder1,
    rewardsHolder2,
    rewardsHolder3,
    tokenHolder1,
    tokenHolder2,
    tokenHolder3,
    tokenHolder4,
  ] = accounts;
  let tokenHolders = [tokenHolder1, tokenHolder2, tokenHolder3, tokenHolder4];
  let stakedBalance = ether('25');

  async function checkRewards({ totalRewards, fee = new BN(0) }) {
    let rewardHolderReward = totalRewards
      .sub(fee)
      .div(new BN(rewardHolders.length));

    // check reward holders
    for (const holder of rewardHolders) {
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: holder,
        balance: rewardHolderReward,
        reward: rewardHolderReward,
      });
    }

    // check token holders
    let tokenReward = rewardHolderReward.div(new BN(tokenHolders.length));
    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(tokenReward);
    }
  }

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
      rewardsHolder1,
      rewardsHolder2,
      rewardsHolder3,
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

    // stake tokens
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

  it('distributes rewards correctly', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    let fee = totalRewards.mul(maintainerFee).div(new BN(10000));
    await checkRewards({ totalRewards, fee });
  });

  it('distributes penalties correctly', async () => {
    let totalRewards = ether('-100');

    // update rewards
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    // check rewards holders rewards
    for (const holder of rewardHolders) {
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: new BN(0),
        account: holder,
        balance: new BN(0),
        reward: totalRewards.div(new BN(rewardHolders.length)),
      });
    }

    // check token holders
    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(ether('-6.25'));
    }
  });

  it('rewards do not change if the tokens are withdrawn', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });

    // withdraw tokens
    for (const holder of tokenHolders) {
      await stakedTokens.withdrawTokens(token.address, stakedBalance, '0', {
        from: holder,
      });
    }

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });
  });

  it('rewards do not change if the tokens are staked', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });

    // mint more tokens
    for (const holder of tokenHolders) {
      await token.mint(holder, stakedBalance, {
        from: admin,
      });
    }

    // stake tokens
    for (const holder of tokenHolders) {
      await token.approve(stakedTokens.address, stakedBalance, {
        from: holder,
      });
      await stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
        from: holder,
      });
    }

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });
  });

  it('fails to withdraw rewards when contract is paused', async () => {
    await settings.setPausedContracts(stakedTokens.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

    await expectRevert(
      stakedTokens.withdrawRewards(
        token.address,
        await stakedTokens.rewardOf(token.address, tokenHolders[0]),
        {
          from: tokenHolder1,
        }
      ),
      'StakedTokens: contract is paused'
    );

    await settings.setPausedContracts(stakedTokens.address, false, {
      from: admin,
    });
  });

  it('can withdraw zero rewards', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });

    // withdraw rewards
    for (const holder of tokenHolders) {
      await stakedTokens.withdrawRewards(token.address, '0', {
        from: holder,
      });
    }

    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });
  });

  it('fails to withdraw rewards when token is disabled', async () => {
    await stakedTokens.toggleTokenContract(token.address, false, {
      from: admin,
    });

    await expectRevert(
      stakedTokens.withdrawRewards(
        token.address,
        await stakedTokens.rewardOf(token.address, tokenHolders[0]),
        {
          from: tokenHolder1,
        }
      ),
      'StakedTokens: token is not supported'
    );
  });

  it('can withdraw rewards', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    for (const holder of tokenHolders) {
      let reward = await stakedTokens.rewardOf(token.address, holder);
      let receipt = await stakedTokens.withdrawRewards(token.address, reward, {
        from: holder,
      });

      expectEvent(receipt, 'RewardWithdrawn', {
        token: token.address,
        account: holder,
        amount: reward,
      });
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }

    let rewardHolderReward = totalRewards
      .sub(totalRewards.mul(maintainerFee).div(new BN(10000)))
      .div(new BN(rewardHolders.length));

    // check reward holders
    for (const holder of rewardHolders) {
      if (holder === token.address) {
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: holder,
          balance: new BN(0),
          reward: new BN(0),
        });
      } else {
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: holder,
          balance: rewardHolderReward,
          reward: rewardHolderReward,
        });
      }
    }

    // check token holders
    let tokenReward = rewardHolderReward.div(new BN(tokenHolders.length));
    for (const holder of tokenHolders) {
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: holder,
        balance: tokenReward,
        reward: tokenReward,
      });
    }
  });

  it('cannot withdraw rewards multiple times', async () => {
    let reward = await stakedTokens.rewardOf(token.address, tokenHolder1);
    await stakedTokens.withdrawRewards(token.address, reward, {
      from: tokenHolder1,
    });
    await expectRevert(
      stakedTokens.withdrawRewards(token.address, new BN(1), {
        from: tokenHolder1,
      }),
      'StakedTokens: cannot update account with negative rewards'
    );
  });

  it('can withdraw rewards when staking new tokens', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    let addedBalance = stakedBalance.div(new BN(2));
    for (const holder of tokenHolders) {
      await token.mint(holder, stakedBalance, {
        from: admin,
      });
      await token.approve(stakedTokens.address, addedBalance, {
        from: holder,
      });
    }

    for (const holder of tokenHolders) {
      let halfReward = (await stakedTokens.rewardOf(token.address, holder)).div(
        new BN(2)
      );
      let receipt = await stakedTokens.stakeTokens(
        token.address,
        addedBalance,
        halfReward,
        {
          from: holder,
        }
      );
      expectEvent(receipt, 'RewardWithdrawn', {
        token: token.address,
        account: holder,
        amount: halfReward,
      });
      expectEvent(receipt, 'TokensStaked', {
        token: token.address,
        account: holder,
        amount: addedBalance,
      });
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(halfReward);
      expect(
        await stakedTokens.balanceOf(token.address, holder)
      ).to.be.bignumber.equal(stakedBalance.add(addedBalance));
    }
  });

  it('can withdraw rewards when withdrawing tokens', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    let halfBalance = stakedBalance.div(new BN(2));
    for (const holder of tokenHolders) {
      let halfReward = (await stakedTokens.rewardOf(token.address, holder)).div(
        new BN(2)
      );
      let receipt = await stakedTokens.withdrawTokens(
        token.address,
        halfBalance,
        halfReward,
        {
          from: holder,
        }
      );
      expectEvent(receipt, 'RewardWithdrawn', {
        token: token.address,
        account: holder,
        amount: halfReward,
      });
      expectEvent(receipt, 'TokensWithdrawn', {
        token: token.address,
        account: holder,
        amount: halfBalance,
      });
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(halfReward);
      expect(
        await stakedTokens.balanceOf(token.address, holder)
      ).to.be.bignumber.equal(halfBalance);
    }
  });

  it('calculates checkpoints correctly', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    // add another tokens holder
    let tokensHolder5 = accounts[accounts.length - 1];
    await token.mint(tokensHolder5, stakedBalance, {
      from: admin,
    });
    await token.approve(stakedTokens.address, stakedBalance, {
      from: tokensHolder5,
    });
    await stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
      from: tokensHolder5,
    });
    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });

    expect(
      await stakedTokens.rewardOf(token.address, tokensHolder5)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokensHolder5)
    ).to.be.bignumber.equal(stakedBalance);

    // withdraw half reward
    for (const holder of tokenHolders) {
      let halfReward = (await stakedTokens.rewardOf(token.address, holder)).div(
        new BN(2)
      );
      await stakedTokens.withdrawRewards(token.address, halfReward, {
        from: holder,
      });
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(halfReward);
      expect(
        await stakedTokens.balanceOf(token.address, holder)
      ).to.be.bignumber.equal(stakedBalance);
    }

    // penalty received
    totalRewards = ether('0');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(ether('-2.1875'));
    }

    expect(
      await stakedTokens.rewardOf(token.address, tokensHolder5)
    ).to.be.bignumber.equal(ether('-5'));
    expect(
      await stakedTokens.balanceOf(token.address, tokensHolder5)
    ).to.be.bignumber.equal(stakedBalance);
  });

  it('cannot withdraw or stake tokens when penalties', async () => {
    let totalRewards = ether('-100');

    // update rewards
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    // check rewards holders rewards
    for (const holder of rewardHolders) {
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: new BN(0),
        account: holder,
        balance: new BN(0),
        reward: totalRewards.div(new BN(rewardHolders.length)),
      });
    }

    // check token holders
    for (const holder of tokenHolders) {
      await token.mint(holder, stakedBalance, {
        from: admin,
      });
      await token.approve(stakedTokens.address, stakedBalance, {
        from: holder,
      });
      await expectRevert(
        stakedTokens.stakeTokens(token.address, stakedBalance, '0', {
          from: holder,
        }),
        'StakedTokens: cannot update account with negative rewards'
      );
      await expectRevert(
        stakedTokens.withdrawRewards(token.address, new BN(1), {
          from: holder,
        }),
        'StakedTokens: cannot update account with negative rewards'
      );
      await expectRevert(
        stakedTokens.withdrawTokens(token.address, new BN(1), '0', {
          from: holder,
        }),
        'StakedTokens: cannot update account with negative rewards'
      );
    }
  });
});
