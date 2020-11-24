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
      await stakedTokens.stakeTokens(token.address, stakedBalance, {
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

  it('rewards are 0 when the token contract has negative rewards', async () => {
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
      ).to.be.bignumber.equal(new BN(0));
    }
  });

  it('rewards are withdrawn when the tokens are withdrawn', async () => {
    let totalRewards = ether('100');
    let fee = totalRewards.mul(maintainerFee).div(new BN(10000));
    let rewardHolderReward = totalRewards
      .sub(fee)
      .div(new BN(rewardHolders.length));
    let tokenReward = rewardHolderReward.div(new BN(tokenHolders.length));

    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });
    await checkRewards({ totalRewards, fee });

    // withdraw tokens
    for (const holder of tokenHolders) {
      let receipt = await stakedTokens.withdrawTokens(
        token.address,
        stakedBalance,
        {
          from: holder,
        }
      );
      expectEvent(receipt, 'RewardWithdrawn', {
        token: token.address,
        account: holder,
        amount: tokenReward,
      });
    }

    // check token holders
    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }
  });

  it('rewards are withdrawn when the tokens are staked', async () => {
    let totalRewards = ether('100');
    let fee = totalRewards.mul(maintainerFee).div(new BN(10000));
    let rewardHolderReward = totalRewards
      .sub(fee)
      .div(new BN(rewardHolders.length));
    let tokenReward = rewardHolderReward.div(new BN(tokenHolders.length));

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
      let receipt = await stakedTokens.stakeTokens(
        token.address,
        stakedBalance,
        {
          from: holder,
        }
      );
      expectEvent(receipt, 'RewardWithdrawn', {
        token: token.address,
        account: holder,
        amount: tokenReward,
      });
    }

    // check token holders
    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }
  });

  it('fails to withdraw rewards when contract is paused', async () => {
    await settings.setPausedContracts(stakedTokens.address, true, {
      from: admin,
    });
    expect(await settings.pausedContracts(stakedTokens.address)).equal(true);

    await expectRevert(
      stakedTokens.withdrawRewards(token.address, {
        from: tokenHolder1,
      }),
      'StakedTokens: contract is paused'
    );

    await settings.setPausedContracts(stakedTokens.address, false, {
      from: admin,
    });
  });

  it('can withdraw zero rewards', async () => {
    // withdraw rewards
    for (const holder of tokenHolders) {
      await stakedTokens.withdrawRewards(token.address, {
        from: holder,
      });
    }

    // check token holders
    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }
  });

  it('can withdraw rewards', async () => {
    let totalRewards = ether('100');
    let fee = totalRewards.mul(maintainerFee).div(new BN(10000));
    let rewardHolderReward = totalRewards
      .sub(fee)
      .div(new BN(rewardHolders.length));
    let tokenReward = rewardHolderReward.div(new BN(tokenHolders.length));

    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    for (const holder of tokenHolders) {
      let reward = await stakedTokens.rewardOf(token.address, holder);
      expect(tokenReward).to.be.bignumber.equal(reward);

      let receipt = await stakedTokens.withdrawRewards(token.address, {
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
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    let reward = await stakedTokens.rewardOf(token.address, tokenHolder1);
    let receipt = await stakedTokens.withdrawRewards(token.address, {
      from: tokenHolder1,
    });
    expectEvent(receipt, 'RewardWithdrawn', {
      token: token.address,
      account: tokenHolder1,
      amount: reward,
    });

    await checkRewardEthToken({
      rewardEthToken,
      totalSupply: totalRewards,
      account: tokenHolder1,
      balance: reward,
      reward: reward,
    });
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(new BN(0));

    await stakedTokens.withdrawRewards(token.address, {
      from: tokenHolder1,
    });
    await checkRewardEthToken({
      rewardEthToken,
      totalSupply: totalRewards,
      account: tokenHolder1,
      balance: reward,
      reward: reward,
    });
  });

  it('calculates checkpoints correctly', async () => {
    let totalRewards = ether('100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });
    await checkRewards({
      totalRewards,
      fee: totalRewards.mul(maintainerFee).div(new BN(10000)),
    });

    let reward = await stakedTokens.rewardOf(token.address, tokenHolder1);

    // add another tokens holder
    let tokenHolder5 = accounts[accounts.length - 1];
    await token.mint(tokenHolder5, stakedBalance, {
      from: admin,
    });
    await token.approve(stakedTokens.address, stakedBalance, {
      from: tokenHolder5,
    });
    await stakedTokens.stakeTokens(token.address, stakedBalance, {
      from: tokenHolder5,
    });

    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(stakedBalance);
    expect(await rewardEthToken.rewardOf(token.address)).to.be.bignumber.equal(
      new BN('0')
    );

    // withdraw rewards for all except holder1
    for (const holder of tokenHolders.slice(1)) {
      await stakedTokens.withdrawRewards(token.address, {
        from: holder,
      });
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
      expect(
        await stakedTokens.balanceOf(token.address, holder)
      ).to.be.bignumber.equal(stakedBalance);
      expect(await rewardEthToken.rewardOf(holder)).to.be.bignumber.equal(
        reward
      );
    }

    // check holder 1
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(reward);
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(stakedBalance);
    expect(await rewardEthToken.rewardOf(tokenHolder1)).to.be.bignumber.equal(
      new BN(0)
    );

    // check holder 5
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(stakedBalance);

    // first penalty received
    totalRewards = ether('80');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    // check holder 1
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(reward);
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(stakedBalance);
    expect(await rewardEthToken.rewardOf(tokenHolder1)).to.be.bignumber.equal(
      new BN(0)
    );

    // check holder 5
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(stakedBalance);

    for (const holder of tokenHolders.slice(1)) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }

    // withdraw token holder 1 reward
    await stakedTokens.withdrawRewards(token.address, {
      from: tokenHolder1,
    });
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder1)
    ).to.be.bignumber.equal(stakedBalance);
    expect(await rewardEthToken.rewardOf(tokenHolder1)).to.be.bignumber.equal(
      reward
    );

    // second penalty received
    totalRewards = ether('-100');
    await rewardEthToken.updateTotalRewards(totalRewards, {
      from: balanceReportersContractAddress,
    });

    for (const holder of tokenHolders) {
      expect(
        await stakedTokens.rewardOf(token.address, holder)
      ).to.be.bignumber.equal(new BN(0));
    }

    // check holder 5
    expect(
      await stakedTokens.rewardOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(new BN(0));
    expect(
      await stakedTokens.balanceOf(token.address, tokenHolder5)
    ).to.be.bignumber.equal(stakedBalance);
  });
});
