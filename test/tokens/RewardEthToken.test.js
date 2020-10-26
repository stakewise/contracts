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
const {
  deployAndInitializeSettings,
  initialSettings,
} = require('../../deployments/settings');
const {
  deployStakingEthToken,
  deployRewardEthToken,
  initializeStakingEthToken,
  initializeRewardEthToken,
} = require('../../deployments/tokens');
const { checkStakingEthToken, checkRewardEthToken } = require('../utils');

const StakingEthToken = artifacts.require('StakingEthToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Settings = artifacts.require('Settings');

const validatorDepositAmount = new BN(initialSettings.validatorDepositAmount);

async function deployTokens({
  settings,
  balanceReportersContractAddress,
  poolContractAddress,
}) {
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

  return [
    await RewardEthToken.at(rewardEthTokenContractAddress),
    await StakingEthToken.at(stakingEthTokenContractAddress),
  ];
}

contract('RewardEthToken', ([_, ...accounts]) => {
  let settings, stakingEthToken, rewardEthToken;
  let [
    poolContractAddress,
    admin,
    balanceReportersContractAddress,
    ...otherAccounts
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
    [rewardEthToken, stakingEthToken] = await deployTokens({
      settings,
      balanceReportersContractAddress,
      poolContractAddress,
    });
  });

  describe('updateTotalRewards', () => {
    it('anyone cannot update rewards', async () => {
      await expectRevert(
        rewardEthToken.updateTotalRewards(ether('10'), {
          from: otherAccounts[0],
        }),
        'RewardEthToken: permission denied'
      );
      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: new BN(0),
        account: otherAccounts[0],
        balance: new BN(0),
        reward: new BN(0),
      });
    });

    it('balance reporters can update rewards', async () => {
      let deposit = ether('32');
      await stakingEthToken.mint(otherAccounts[0], deposit, {
        from: poolContractAddress,
      });
      let newTotalRewards = ether('10');
      let maintainerReward = newTotalRewards
        .mul(new BN(initialSettings.maintainerFee))
        .div(new BN(10000));
      let userReward = newTotalRewards.sub(maintainerReward);

      let receipt = await rewardEthToken.updateTotalRewards(newTotalRewards, {
        from: balanceReportersContractAddress,
      });

      expectEvent(receipt, 'RewardsUpdated', {
        periodRewards: newTotalRewards,
        totalRewards: newTotalRewards,
        rewardRate: userReward.mul(ether('1')).div(deposit),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: newTotalRewards,
        account: otherAccounts[0],
        balance: userReward,
        reward: userReward,
      });
      await checkRewardEthToken({
        rewardEthToken,
        account: initialSettings.maintainer,
        balance: maintainerReward,
        reward: maintainerReward,
      });
    });

    it('calculates account rewards correctly', async () => {
      let testCases = [
        {
          totalRewards: ether('0.330183305588444444'),
          maintainerReward: ether('0.033018330558844444'),
          users: [
            { deposit: ether('2.04'), reward: ether('0.018944267158137') },
            { deposit: ether('3.771'), reward: ether('0.035019035026144425') },
            { deposit: ether('3.782'), reward: ether('0.03512118548631085') },
            { deposit: ether('3.661'), reward: ether('0.033997530424480175') },
            { deposit: ether('4.513'), reward: ether('0.041909547884643275') },
            { deposit: ether('4.166'), reward: ether('0.03868716518666605') },
            { deposit: ether('1.414'), reward: ether('0.01313097733412045') },
            { deposit: ether('0.991'), reward: ether('0.009202827820447925') },
            { deposit: ether('3.043'), reward: ether('0.028258531844221025') },
            { deposit: ether('4.382'), reward: ether('0.04069302876811585') },
            { deposit: ether('0.237'), reward: ether('0.002200878096312975') },
          ],
        },
        {
          totalRewards: ether('2.145744568757666688'),
          maintainerReward: ether('0.214574456875766668'),
          users: Array(validatorDepositAmount.div(ether('4')).toNumber()).fill({
            deposit: ether('4'),
            reward: ether('0.2413962639852375'),
          }),
        },
        {
          totalRewards: ether('1.187486063937777777'),
          maintainerReward: ether('0.118748606393777777'),
          users: [{ deposit: ether('32.0'), reward: ether('1.0687374575440') }],
        },
      ];

      for (const { totalRewards, maintainerReward, users } of testCases) {
        // redeploy tokens
        [rewardEthToken, stakingEthToken] = await deployTokens({
          settings,
          balanceReportersContractAddress,
          poolContractAddress,
        });

        // mint deposits
        for (let i = 0; i < users.length; i++) {
          await stakingEthToken.mint(otherAccounts[i], users[i].deposit, {
            from: poolContractAddress,
          });
        }

        // update rewards
        await rewardEthToken.updateTotalRewards(totalRewards, {
          from: balanceReportersContractAddress,
        });

        // check maintainer reward
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: initialSettings.maintainer,
          balance: maintainerReward,
          reward: maintainerReward,
        });

        // check rewards and deposits
        for (let i = 0; i < users.length; i++) {
          let { reward, deposit } = users[i];
          await checkRewardEthToken({
            rewardEthToken,
            account: otherAccounts[i],
            balance: reward,
            reward: reward,
          });

          await checkStakingEthToken({
            stakingEthToken,
            totalSupply: validatorDepositAmount,
            account: otherAccounts[i],
            balance: deposit,
            deposit,
          });
        }
      }
    });

    it('calculates account penalties correctly', async () => {
      let testCases = [
        {
          totalRewards: ether('-0.627626464'),
          users: [
            {
              deposit: ether('2.255'),
              penalisedReturn: ether('2.210771947615'),
            },
            {
              deposit: ether('0.861'),
              penalisedReturn: ether('0.844112925453'),
            },
            {
              deposit: ether('0.606'),
              penalisedReturn: ether('0.594114323838'),
            },
            {
              deposit: ether('4.776'),
              penalisedReturn: ether('4.682326750248'),
            },
            { deposit: ether('0.88'), penalisedReturn: ether('0.86274027224') },
            {
              deposit: ether('1.906'),
              penalisedReturn: ether('1.868616998738'),
            },
            {
              deposit: ether('3.021'),
              penalisedReturn: ether('2.961748139133'),
            },
            {
              deposit: ether('2.453'),
              penalisedReturn: ether('2.404888508869'),
            },
            {
              deposit: ether('0.128'),
              penalisedReturn: ether('0.125489494144'),
            },
            {
              deposit: ether('2.756'),
              penalisedReturn: ether('2.701945670788'),
            },
            {
              deposit: ether('4.506'),
              penalisedReturn: ether('4.417622348538'),
            },
            { deposit: ether('3.04'), penalisedReturn: ether('2.98037548592') },
            {
              deposit: ether('4.618'),
              penalisedReturn: ether('4.527425655914'),
            },
            {
              deposit: ether('0.194'),
              penalisedReturn: ether('0.190195014562'),
            },
          ],
        },
        {
          totalRewards: ether('-0.243422652'),
          users: Array(validatorDepositAmount.div(ether('4')).toNumber()).fill({
            deposit: ether('4'),
            penalisedReturn: ether('3.9695721685'),
          }),
        },
        {
          totalRewards: ether('-2.001935196'),
          users: [
            { deposit: ether('32'), penalisedReturn: ether('29.998064804000') },
          ],
        },
      ];

      for (const { totalRewards, users } of testCases) {
        // redeploy tokens
        [rewardEthToken, stakingEthToken] = await deployTokens({
          settings,
          balanceReportersContractAddress,
          poolContractAddress,
        });

        // mint deposits
        for (let i = 0; i < users.length; i++) {
          await stakingEthToken.mint(otherAccounts[i], users[i].deposit, {
            from: poolContractAddress,
          });
        }

        // update penalty
        await rewardEthToken.updateTotalRewards(totalRewards, {
          from: balanceReportersContractAddress,
        });

        // check rewards and deposits
        for (let i = 0; i < users.length; i++) {
          let { penalisedReturn, deposit } = users[i];
          await checkRewardEthToken({
            rewardEthToken,
            totalSupply: new BN(0),
            account: otherAccounts[i],
            balance: new BN(0),
            reward: penalisedReturn.sub(deposit),
          });

          await checkStakingEthToken({
            stakingEthToken,
            totalSupply: validatorDepositAmount.add(totalRewards),
            account: otherAccounts[i],
            balance: penalisedReturn,
            deposit,
          });
        }
      }
    });

    it('calculates rewards and deposits correctly with different actions', async () => {
      let tests = [
        // initial deposits
        [
          { deposit: ether('5'), reward: ether('0') },
          { deposit: ether('10'), reward: ether('0') },
          { deposit: ether('25'), reward: ether('0') },
        ],
        // user1 transfers 4 stETH to user2
        [
          { deposit: ether('5'), reward: ether('0') },
          { deposit: ether('6'), reward: ether('0') },
          { deposit: ether('29'), reward: ether('0') },
        ],
        // period rewards: 0.773174861417694153
        // maintainer reward: 0.077317486141769415
        // total rewards: 0.773174861417694153
        // reward rate: 0.017396434381898118
        [
          { deposit: ether('5'), reward: ether('0.086982171909490590') },
          { deposit: ether('6'), reward: ether('0.104378606291388708') },
          {
            deposit: ether('29'),
            reward: ether('0.504496597075045422'),
          },
        ],
        // user2 transfer 6 stETH to user0
        // user1 transfers 0.104378606291388710 rwETH to user2
        // user3 creates new deposit with 4 stETH
        [
          {
            deposit: ether('11'),
            reward: ether('0.086982171909490590'),
          },
          { deposit: ether('6'), reward: ether('0') },
          { deposit: ether('23'), reward: ether('0.60887520336643413') },
          { deposit: ether('4'), reward: ether('0') },
        ],
        // period rewards: -1.060653959130621
        // total rewards: -0.364796583854696262
        // reward rate: -0.006709337416525086
        [
          {
            deposit: ether('11'),
            reward: ether('-0.178181317873164654'),
          },
          { deposit: ether('6'), reward: ether('-0.144634630790539224') },
          { deposit: ether('23'), reward: ether('0.054442452002700438') },
          { deposit: ether('4'), reward: ether('-0.096423087193692816') },
        ],
        // user3 transfers 3.903576912806307184 stETH to user0
        // user2 transfers 0.054442452002700438 rwETH to user3
        [
          {
            deposit: ether('14.903576912806307184'),
            reward: ether('-0.178181317873164654'),
          },
          { deposit: ether('6'), reward: ether('-0.144634630790539224') },
          { deposit: ether('23'), reward: ether('0') },
          {
            deposit: ether('0.096423087193692816'),
            reward: ether('-0.041980635190992378'),
          },
        ],
        // period rewards: 2.1201081573283083
        // total rewards: 1.755311573473612038
        // reward rate: 0.041474938886391011
        [
          {
            deposit: ether('14.903576912806307184'),
            reward: ether('0.539936749995255735'),
          },
          { deposit: ether('6'), reward: ether('0.144471027026957358') },
          { deposit: ether('23'), reward: ether('1.108238354967070231') },
          {
            deposit: ether('0.096423087193692816'),
            reward: ether('-0.037334558515671313'),
          },
        ],
      ];

      // 0. users make deposits
      let totalDeposits = new BN(0);
      for (let i = 0; i < tests[0].length; i++) {
        let deposit = tests[0][i].deposit;
        let reward = tests[0][i].reward;

        totalDeposits = totalDeposits.add(deposit);
        await stakingEthToken.mint(otherAccounts[i], deposit, {
          from: poolContractAddress,
        });

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: new BN(0),
          account: otherAccounts[i],
          balance: reward,
          reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits,
          account: otherAccounts[i],
          balance: deposit,
          deposit,
        });
      }

      // 1. user1 transfers 4 stETH to user2
      await stakingEthToken.transfer(otherAccounts[2], ether('4'), {
        from: otherAccounts[1],
      });
      for (let i = 0; i < tests[1].length; i++) {
        let deposit = tests[1][i].deposit;
        let reward = tests[1][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: new BN(0),
          account: otherAccounts[i],
          balance: reward,
          reward: reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits,
          account: otherAccounts[i],
          balance: deposit,
          deposit,
        });
      }

      // 2. period reward: 0.773174861417694153 arrives
      let periodRewards = ether('0.773174861417694153');
      let maintainerReward = ether('0.077317486141769415');
      let totalRewards = periodRewards;
      let rewardRate = ether('0.017396434381898118');
      let receipt = await rewardEthToken.updateTotalRewards(totalRewards, {
        from: balanceReportersContractAddress,
      });
      expectEvent(receipt, 'RewardsUpdated', {
        periodRewards,
        totalRewards,
        rewardRate,
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: initialSettings.maintainer,
        balance: maintainerReward,
        reward: maintainerReward,
      });

      for (let i = 0; i < tests[2].length; i++) {
        let deposit = tests[2][i].deposit;
        let reward = tests[2][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: otherAccounts[i],
          balance: reward,
          reward: reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits,
          account: otherAccounts[i],
          balance: deposit,
          deposit,
        });
      }

      // 3. user2 transfer 6 stETH to user0
      await stakingEthToken.transfer(otherAccounts[0], ether('6'), {
        from: otherAccounts[2],
      });
      // user1 transfers 0.104378606291388708 rwETH to user2
      await rewardEthToken.transfer(
        otherAccounts[2],
        ether('0.104378606291388708'),
        {
          from: otherAccounts[1],
        }
      );
      // user3 creates new deposit with 4 stETH
      await stakingEthToken.mint(otherAccounts[3], ether('4'), {
        from: poolContractAddress,
      });
      totalDeposits = totalDeposits.add(ether('4'));

      for (let i = 0; i < tests[3].length; i++) {
        let deposit = tests[3][i].deposit;
        let reward = tests[3][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: otherAccounts[i],
          balance: reward,
          reward: reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits,
          account: otherAccounts[i],
          balance: deposit,
          deposit,
        });
      }

      // 4. period reward: -1.060653959130621 arrives
      periodRewards = ether('-1.060653959130621');
      totalRewards = totalRewards.add(periodRewards);
      rewardRate = ether('-0.006709337416525086');
      receipt = await rewardEthToken.updateTotalRewards(totalRewards, {
        from: balanceReportersContractAddress,
      });
      expectEvent(receipt, 'RewardsUpdated', {
        periodRewards,
        totalRewards,
        rewardRate,
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: new BN(0),
        account: initialSettings.maintainer,
        balance: maintainerReward,
        reward: maintainerReward,
      });

      for (let i = 0; i < tests[4].length; i++) {
        let deposit = tests[4][i].deposit;
        let reward = tests[4][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? reward : new BN(0),
          reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits.add(totalRewards),
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? deposit : deposit.add(reward),
          deposit,
        });
      }

      // 5. user3 transfers 3.903576912806307184 stETH to user0
      await stakingEthToken.transfer(
        otherAccounts[0],
        ether('3.903576912806307184'),
        {
          from: otherAccounts[3],
        }
      );
      // user2 transfers 0.054442452002700438 rwETH to user3
      await rewardEthToken.transfer(
        otherAccounts[3],
        ether('0.054442452002700438'),
        {
          from: otherAccounts[2],
        }
      );

      for (let i = 0; i < tests[5].length; i++) {
        let deposit = tests[5][i].deposit;
        let reward = tests[5][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: new BN(0),
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? reward : new BN(0),
          reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits.add(totalRewards),
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? deposit : deposit.add(reward),
          deposit,
        });
      }

      // 6. periodic reward: 2.3556757303647870 arrives
      periodRewards = ether('2.3556757303647870');
      totalRewards = totalRewards.add(periodRewards);
      maintainerReward = maintainerReward.add(ether('0.2355675730364787'));
      rewardRate = ether('0.041474938886391011');
      receipt = await rewardEthToken.updateTotalRewards(totalRewards, {
        from: balanceReportersContractAddress,
      });
      expectEvent(receipt, 'RewardsUpdated', {
        periodRewards,
        totalRewards,
        rewardRate,
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: initialSettings.maintainer,
        balance: maintainerReward,
        reward: maintainerReward,
      });

      for (let i = 0; i < tests[6].length; i++) {
        let deposit = tests[6][i].deposit;
        let reward = tests[6][i].reward;

        // perform checks
        await checkRewardEthToken({
          rewardEthToken,
          totalSupply: totalRewards,
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? reward : new BN(0),
          reward,
        });
        await checkStakingEthToken({
          stakingEthToken,
          totalSupply: totalDeposits,
          account: otherAccounts[i],
          balance: reward.gt(new BN(0)) ? deposit : deposit.add(reward),
          deposit,
        });
      }
    });
  });

  describe('transfer', () => {
    let value1 = ether('4');
    let value2 = ether('5');
    let maintainerReward = ether('1');
    let totalRewards = value1.add(value2).add(maintainerReward);
    let [sender1, sender2] = otherAccounts;

    beforeEach(async () => {
      await settings.setMaintainerFee(new BN(1000), {
        from: admin,
      });

      await stakingEthToken.mint(sender1, value1, {
        from: poolContractAddress,
      });
      await stakingEthToken.mint(sender2, value2, {
        from: poolContractAddress,
      });

      await rewardEthToken.updateTotalRewards(totalRewards, {
        from: balanceReportersContractAddress,
      });
    });

    it('cannot transfer to zero address', async () => {
      await expectRevert(
        rewardEthToken.transfer(constants.ZERO_ADDRESS, value1, {
          from: sender1,
        }),
        'RewardEthToken: transfer to the zero address'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: value1,
        reward: value1,
      });
    });

    it('cannot transfer from zero address', async () => {
      await expectRevert(
        rewardEthToken.transferFrom(constants.ZERO_ADDRESS, sender2, value1, {
          from: sender1,
        }),
        'RewardEthToken: transfer from the zero address'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: value1,
        reward: value1,
      });
    });

    it('cannot transfer zero amount', async () => {
      await expectRevert(
        rewardEthToken.transfer(sender2, ether('0'), {
          from: sender1,
        }),
        'RewardEthToken: invalid amount'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: value1,
        reward: value1,
      });
    });

    it('cannot transfer with paused contract', async () => {
      await settings.setPausedContracts(rewardEthToken.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(rewardEthToken.address)).equal(
        true
      );

      await expectRevert(
        rewardEthToken.transfer(sender2, value1, {
          from: sender1,
        }),
        'RewardEthToken: contract is paused'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: value1,
        reward: value1,
      });
      await settings.setPausedContracts(rewardEthToken.address, false, {
        from: admin,
      });
    });

    it('cannot transfer amount bigger than balance', async () => {
      await expectRevert(
        rewardEthToken.transfer(sender2, value1.add(ether('1')), {
          from: sender1,
        }),
        'RewardEthToken: invalid amount'
      );

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: value1,
        reward: value1,
      });
    });

    it('can transfer rwETH tokens to different account', async () => {
      let receipt = await rewardEthToken.transfer(sender2, value1, {
        from: sender1,
      });

      expectEvent(receipt, 'Transfer', {
        from: sender1,
        to: sender2,
        value: value1,
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender1,
        balance: new BN(0),
        deposit: new BN(0),
      });

      await checkRewardEthToken({
        rewardEthToken,
        totalSupply: totalRewards,
        account: sender2,
        balance: value1.add(value2),
        deposit: value2,
      });
    });
  });

  it('anyone cannot update user reward', async () => {
    await expectRevert(
      rewardEthToken.updateRewardCheckpoint(otherAccounts[0], {
        from: otherAccounts[0],
      }),
      'RewardEthToken: permission denied'
    );
  });
});
