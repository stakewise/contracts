const {
  expectRevert,
  expectEvent,
  ether,
  send,
  BN,
  constants,
  time,
} = require('@openzeppelin/test-helpers');
const { fromRpcSig } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const {
  getOracleAccounts,
  checkSwiseStakingPosition,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  setTotalRewards,
} = require('../utils');

const SwiseStaking = artifacts.require('SwiseStaking');
const StakeWiseToken = artifacts.require('StakeWiseToken');
const RewardEthToken = artifacts.require('RewardEthToken');
const Pool = artifacts.require('Pool');
const Oracles = artifacts.require('Oracles');

const buildPermitData = ({
  verifyingContract,
  deadline = constants.MAX_UINT256,
  owner,
  spender,
  value,
  name,
  chainId = '31337',
  version = '1',
  nonce = 0,
}) => ({
  primaryType: 'Permit',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: { name, version, chainId, verifyingContract },
  message: { owner, spender, value, nonce, deadline },
});

contract('SWISE Staking', ([anyone, account1, account2]) => {
  const admin = contractSettings.admin;
  let token, swiseStaking, rewardEthToken, oracles, oracleAccounts, pool;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    token = await StakeWiseToken.at(contracts.stakeWiseToken);
    rewardEthToken = await RewardEthToken.at(contracts.rewardEthToken);
    swiseStaking = await SwiseStaking.at(upgradedContracts.swiseStaking);
    oracles = await Oracles.at(contracts.oracles);
    oracleAccounts = await getOracleAccounts({ oracles });
    pool = await Pool.at(contracts.pool);

    await rewardEthToken.setMaintainer(swiseStaking.address, { from: admin });
  });

  afterEach(async () => resetFork());

  describe('multiplier', () => {
    const newMultiplier = '1000';
    const newDuration = '311040000';

    it('not admin fails to update multiplier', async () => {
      await expectRevert(
        swiseStaking.setMultiplier(newMultiplier, newDuration, {
          from: anyone,
        }),
        'OwnablePausable: access denied'
      );
    });

    it('admin can update multiplier', async () => {
      let receipt = await swiseStaking.setMultiplier(
        newMultiplier,
        newDuration,
        {
          from: admin,
        }
      );
      await expectEvent(receipt, 'MultiplierUpdated', {
        sender: admin,
        multiplier: newMultiplier,
        duration: newDuration,
      });
      expect(await swiseStaking.durations(newMultiplier)).to.bignumber.equal(
        newDuration
      );
    });
  });

  describe('create position', () => {
    const multiplier = Object.keys(contractSettings.multipliers)[0];
    const duration = contractSettings.multipliers[multiplier];
    const amount = ether('100');

    beforeEach(async () => {
      await token.transfer(account1, amount, { from: admin });
      await token.transfer(account2, amount, { from: admin });
    });

    it('cannot create position with zero amount', async () => {
      await expectRevert(
        swiseStaking.createPosition('0', multiplier, {
          from: anyone,
        }),
        'SwiseStaking: invalid amount'
      );
    });

    it('cannot create position with unregistered multiplier', async () => {
      await expectRevert(
        swiseStaking.createPosition(amount, '0', {
          from: anyone,
        }),
        'SwiseStaking: multiplier not registered'
      );
    });

    it('cannot create position when one already exists', async () => {
      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });

      await swiseStaking.createPosition(amount, multiplier, {
        from: account1,
      });

      await expectRevert(
        swiseStaking.createPosition(amount, multiplier, {
          from: account1,
        }),
        'SwiseStaking: position exists'
      );
    });

    it('cannot create position without allowance', async () => {
      await expectRevert(
        swiseStaking.createPosition(amount, multiplier, {
          from: account1,
        }),
        'SafeMath: subtraction overflow'
      );
    });

    it('can create new position', async () => {
      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });

      let receipt = await swiseStaking.createPosition(amount, multiplier, {
        from: account1,
      });
      await expectEvent(receipt, 'PositionCreated', {
        owner: account1,
        multiplier: new BN(multiplier),
        amount,
      });
      let positionPoints = await checkSwiseStakingPosition(swiseStaking, {
        amount,
        multiplier,
        duration,
        account: account1,
      });
      expect(await swiseStaking.totalPoints()).to.bignumber.equal(
        positionPoints
      );
    });

    it('cannot create position when paused', async () => {
      await swiseStaking.pause({ from: admin });
      expect(await swiseStaking.paused()).equal(true);

      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });

      await expectRevert(
        swiseStaking.createPosition(amount, multiplier, {
          from: account1,
        }),
        'Pausable: paused'
      );
    });

    it('creates position with already accumulated rewards by other users', async () => {
      // first account creates position
      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });
      await swiseStaking.createPosition(amount, multiplier, {
        from: account1,
      });

      // add new rewards
      let totalRewards = await rewardEthToken.totalSupply();
      let periodReward = ether('1000');
      totalRewards = totalRewards.add(periodReward);

      await setTotalRewards({
        admin,
        rewardEthToken,
        oracles,
        oracleAccounts,
        pool,
        totalRewards,
      });
      let ethReward = await rewardEthToken.balanceOf(swiseStaking.address);

      // XXX: 30 wei is lost during the calculation
      ethReward = ethReward.sub(new BN(30));

      // check all rewards assigned to the same account
      let positionPoints1 = await checkSwiseStakingPosition(swiseStaking, {
        multiplier,
        amount,
        account: account1,
        duration,
        ethReward,
      });

      // create new position
      await token.approve(swiseStaking.address, amount, {
        from: account2,
      });
      await swiseStaking.createPosition(amount, multiplier, {
        from: account2,
      });

      // check no rewards assigned to second account
      let positionPoints2 = await checkSwiseStakingPosition(swiseStaking, {
        multiplier,
        amount,
        account: account2,
        duration,
      });

      expect(await swiseStaking.totalPoints()).to.bignumber.equal(
        positionPoints1.add(positionPoints2)
      );
    });

    it('can create new position with permit', async () => {
      let holder = web3.eth.accounts.create();
      await token.transfer(holder.address, amount, { from: admin });
      await send.ether(anyone, holder.address, ether('10'));

      // generate signature
      const data = buildPermitData({
        name: await token.name(),
        verifyingContract: token.address,
        value: amount,
        owner: holder.address,
        spender: swiseStaking.address,
      });

      const signature = ethSigUtil.signTypedMessage(
        Buffer.from(holder.privateKey.substring(2), 'hex'),
        { data }
      );
      let { v, r, s } = fromRpcSig(signature);
      let encodedData = await swiseStaking.contract.methods
        .createPositionWithPermit(
          amount,
          multiplier,
          constants.MAX_UINT256,
          false,
          v,
          r,
          s
        )
        .encodeABI();

      const tx = {
        from: holder.address,
        to: swiseStaking.address,
        data: encodedData,
        gas: 1000000,
      };

      let signedTx = await web3.eth.accounts.signTransaction(
        tx,
        holder.privateKey
      );
      let receipt = await web3.eth.sendSignedTransaction(
        signedTx.rawTransaction
      );

      await expectEvent.inTransaction(
        receipt.transactionHash,
        SwiseStaking,
        'PositionCreated',
        {
          owner: holder.address,
          multiplier: new BN(multiplier),
          amount,
        }
      );
      let positionPoints = await checkSwiseStakingPosition(swiseStaking, {
        amount,
        multiplier,
        duration,
        account: holder.address,
      });
      expect(await swiseStaking.totalPoints()).to.bignumber.equal(
        positionPoints
      );
    });
  });

  describe('update position', () => {
    const amount = ether('100');
    const multiplier = Object.keys(contractSettings.multipliers)[0];
    const duration = contractSettings.multipliers[multiplier];

    beforeEach(async () => {
      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });
      await token.transfer(account1, amount, { from: admin });
      await swiseStaking.createPosition(amount, multiplier, {
        from: account1,
      });

      await token.approve(swiseStaking.address, amount, {
        from: account2,
      });
      await token.transfer(account2, amount, { from: admin });
      await swiseStaking.createPosition(amount, multiplier, {
        from: account2,
      });
    });

    it('cannot update position when does not exist', async () => {
      await expectRevert(
        swiseStaking.updatePosition(new BN(0), new BN(0), false, {
          from: anyone,
        }),
        'SwiseStaking: position does not exist'
      );
    });

    it('cannot update position when paused', async () => {
      await swiseStaking.pause({ from: admin });
      expect(await swiseStaking.paused()).equal(true);

      await expectRevert(
        swiseStaking.updatePosition(new BN(0), new BN(0), false, {
          from: account1,
        }),
        'Pausable: paused'
      );
    });

    describe('multiplier', () => {
      it('cannot update position with invalid multiplier', async () => {
        await expectRevert(
          swiseStaking.updatePosition(
            new BN(0),
            new BN('2').pow(new BN('32')).sub(new BN('1')),
            false,
            {
              from: account1,
            }
          ),
          'SwiseStaking: invalid new multiplier'
        );
      });

      it('cannot update position with smaller multiplier', async () => {
        const newMultiplier = new BN(multiplier).sub(new BN('1'));
        const newDuration = new BN(duration).div(new BN('2'));
        await swiseStaking.setMultiplier(newMultiplier, newDuration, {
          from: admin,
        });

        await expectRevert(
          swiseStaking.updatePosition(new BN(0), newMultiplier, false, {
            from: account1,
          }),
          'SwiseStaking: invalid new multiplier'
        );
      });

      it('must update expired position with new multiplier', async () => {
        await time.increase(duration);

        await checkSwiseStakingPosition(swiseStaking, {
          amount,
          multiplier,
          duration,
          account: account1,
        });

        await expectRevert(
          swiseStaking.updatePosition(new BN(0), new BN(0), false, {
            from: account1,
          }),
          'SwiseStaking: new multiplier must be added'
        );
      });

      it('decreases multiplier on position update', async () => {
        await time.increase(new BN(duration).div(new BN(2)));

        // add new rewards
        let totalRewards = await rewardEthToken.totalSupply();
        let periodReward = ether('1000');
        totalRewards = totalRewards.add(periodReward);

        await setTotalRewards({
          admin,
          rewardEthToken,
          oracles,
          oracleAccounts,
          pool,
          totalRewards,
        });
        let ethReward = await rewardEthToken.balanceOf(swiseStaking.address);

        // XXX: 30 wei is lost during the calculation
        ethReward = ethReward.sub(new BN(30)).div(new BN('2'));

        let positionPoints1 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount,
          account: account1,
          duration,
          ethReward,
        });
        let totalPoints1 = await swiseStaking.totalPoints();

        let receipt = await swiseStaking.updatePosition(
          new BN(0),
          new BN(0),
          false,
          {
            from: account1,
          }
        );

        let multiplier2 = (await swiseStaking.positions(account1)).multiplier;
        expectEvent(receipt, 'PositionUpdated', {
          owner: account1,
          newAmount: amount,
          multiplier: multiplier2,
        });

        let positionPoints2 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier: multiplier2,
          amount,
          account: account1,
          duration,
          ethReward: new BN(0),
        });

        let totalPoints2 = await swiseStaking.totalPoints();

        expect(totalPoints1.gt(totalPoints2)).to.equal(true);
        expect(positionPoints1.gt(positionPoints2)).to.equal(true);
        expect(new BN(multiplier).gt(multiplier2)).to.equal(true);
      });

      it('can update position with the new multiplier', async () => {
        await time.increase(new BN(duration).div(new BN(2)));

        // add new rewards
        let totalRewards = await rewardEthToken.totalSupply();
        let periodReward = ether('1000');
        totalRewards = totalRewards.add(periodReward);

        await setTotalRewards({
          admin,
          rewardEthToken,
          oracles,
          oracleAccounts,
          pool,
          totalRewards,
        });
        let ethReward = await rewardEthToken.balanceOf(swiseStaking.address);

        // XXX: 30 wei is lost during the calculation
        ethReward = ethReward.sub(new BN(30)).div(new BN('2'));

        let positionPoints1 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount,
          account: account1,
          duration,
          ethReward,
        });
        let totalPoints1 = await swiseStaking.totalPoints();

        let receipt = await swiseStaking.updatePosition(
          new BN(0),
          multiplier,
          false,
          {
            from: account1,
          }
        );

        expectEvent(receipt, 'PositionUpdated', {
          owner: account1,
          newAmount: amount,
          multiplier: new BN(multiplier),
        });

        let positionPoints2 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount,
          account: account1,
          duration,
          ethReward: new BN(0),
        });
        let totalPoints2 = await swiseStaking.totalPoints();

        expect(totalPoints1).to.bignumber.equal(totalPoints2);
        expect(positionPoints1).to.bignumber.equal(positionPoints2);
      });
    });

    describe('add amount', () => {
      it('cannot update position with invalid amount', async () => {
        await expectRevert(
          swiseStaking.updatePosition(
            new BN('2').pow(new BN('96')).sub(new BN('1')),
            new BN(0),
            false,
            {
              from: account1,
            }
          ),
          'SwiseStaking: invalid added amount'
        );
      });

      it('cannot update position with not owned amount', async () => {
        await token.approve(swiseStaking.address, amount, {
          from: account1,
        });
        await expectRevert(
          swiseStaking.updatePosition(amount, new BN(0), false, {
            from: account1,
          }),
          'SafeMath: subtraction overflow'
        );
      });

      it('can update position with added SWISE', async () => {
        await token.transfer(account1, amount, { from: admin });
        await token.approve(swiseStaking.address, amount, {
          from: account1,
        });

        let positionPoints1 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount,
          account: account1,
          duration,
        });
        let totalPoints1 = await swiseStaking.totalPoints();

        let receipt = await swiseStaking.updatePosition(
          amount,
          new BN(0),
          false,
          {
            from: account1,
          }
        );
        expectEvent(receipt, 'PositionUpdated', {
          owner: account1,
          newAmount: new BN(amount).mul(new BN(2)),
          multiplier: multiplier,
        });

        let positionPoints2 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount: amount.mul(new BN(2)),
          account: account1,
          duration,
        });
        let totalPoints2 = await swiseStaking.totalPoints();
        expect(positionPoints2).to.be.bignumber.equal(
          positionPoints1.mul(new BN(2))
        );
        expect(totalPoints2).to.be.bignumber.equal(
          totalPoints1.sub(positionPoints1).add(positionPoints2)
        );
      });

      it('can update position with compounded SWISE rewards', async () => {
        await token.transfer(account1, amount, { from: admin });
        await token.approve(swiseStaking.address, amount, {
          from: account1,
        });

        const newMultiplier = Object.keys(contractSettings.multipliers)[1];
        const newDuration = contractSettings.multipliers[newMultiplier];

        // add new rewards
        let totalRewards = await rewardEthToken.totalSupply();
        let periodReward = ether('1000');
        totalRewards = totalRewards.add(periodReward);

        await setTotalRewards({
          admin,
          rewardEthToken,
          oracles,
          oracleAccounts,
          pool,
          totalRewards,
        });
        let ethReward = await rewardEthToken.balanceOf(swiseStaking.address);

        // XXX: 30 wei is lost during the calculation
        ethReward = ethReward.sub(new BN(30)).div(new BN('2'));

        let positionPoints1 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier,
          amount,
          account: account1,
          duration,
          ethReward,
        });

        // account 2 withdraws his amount
        await swiseStaking.withdrawPosition({ from: account2 });
        let swiseReward = (await swiseStaking.positions(account1)).swiseReward;

        let receipt = await swiseStaking.updatePosition(
          amount,
          newMultiplier,
          true,
          {
            from: account1,
          }
        );

        expectEvent(receipt, 'PositionUpdated', {
          owner: account1,
          newAmount: amount.mul(new BN(2)).add(swiseReward),
          multiplier: new BN(newMultiplier),
        });

        let positionPoints2 = await checkSwiseStakingPosition(swiseStaking, {
          multiplier: newMultiplier,
          amount: amount.mul(new BN(2)).add(swiseReward),
          account: account1,
          duration: newDuration,
          ethReward: new BN(0),
          swiseReward: new BN(0),
        });
        let totalPoints2 = await swiseStaking.totalPoints();

        expect(totalPoints2).to.bignumber.equal(positionPoints2);
        expect(positionPoints2.gt(positionPoints1)).to.equal(true);
      });

      it('can pull rewards', async () => {
        // add new rewards
        let totalRewards = await rewardEthToken.totalSupply();
        let periodReward = ether('1000');
        totalRewards = totalRewards.add(periodReward);

        await setTotalRewards({
          admin,
          rewardEthToken,
          oracles,
          oracleAccounts,
          pool,
          totalRewards,
        });

        // account 2 withdraws his amount
        await swiseStaking.withdrawPosition({ from: account2 });
        let { swiseReward, ethReward } = await swiseStaking.positions(account1);

        let totalPoints1 = await swiseStaking.totalPoints();
        let receipt = await swiseStaking.updatePosition(
          new BN(0),
          new BN(0),
          false,
          {
            from: account1,
          }
        );
        let totalPoints2 = await swiseStaking.totalPoints();

        expectEvent(receipt, 'PositionUpdated', {
          owner: account1,
          newAmount: amount,
          multiplier: new BN(multiplier),
        });

        expect(await token.balanceOf(account1)).to.bignumber.equal(swiseReward);
        expect(await rewardEthToken.balanceOf(account1)).to.bignumber.equal(
          ethReward
        );

        expect(totalPoints1).to.bignumber.equal(totalPoints2);
      });
    });
  });

  describe('withdraw position', () => {
    const amount = ether('100');
    const multiplier = Object.keys(contractSettings.multipliers)[0];
    const duration = contractSettings.multipliers[multiplier];

    beforeEach(async () => {
      await token.approve(swiseStaking.address, amount, {
        from: account1,
      });
      await token.transfer(account1, amount, { from: admin });
      await swiseStaking.createPosition(amount, multiplier, {
        from: account1,
      });
    });

    it('cannot withdraw position when does not exist', async () => {
      await expectRevert(
        swiseStaking.withdrawPosition({
          from: anyone,
        }),
        'SwiseStaking: position does not exist'
      );
    });

    it('cannot withdraw position when paused', async () => {
      await swiseStaking.pause({ from: admin });
      expect(await swiseStaking.paused()).equal(true);

      await expectRevert(
        swiseStaking.withdrawPosition({
          from: account1,
        }),
        'Pausable: paused'
      );
    });

    it('cannot withdraw multiple times', async () => {
      await swiseStaking.withdrawPosition({ from: account1 });
      await expectRevert(
        swiseStaking.withdrawPosition({
          from: account1,
        }),
        'SwiseStaking: position does not exist'
      );
    });

    it('can withdraw when duration has not passed with penalty', async () => {
      await time.increase(new BN(duration).div(new BN(2)));

      let totalPoints1 = await swiseStaking.totalPoints();
      let receipt = await swiseStaking.withdrawPosition({ from: account1 });
      let swisePenalty = receipt.logs[0].args.swisePenalty;
      let totalPoints2 = await swiseStaking.totalPoints();

      expectEvent(receipt, 'PositionWithdrawn', {
        owner: account1,
        ethReward: new BN(0),
        swiseReward: new BN(0),
      });
      expect(swisePenalty.lte(amount.div(new BN(2)))).to.equal(true);
      expect(totalPoints1.gt(totalPoints2)).to.equal(true);
      expect(await token.balanceOf(account1)).to.bignumber.equal(
        amount.sub(swisePenalty)
      );
    });

    it('can withdraw when duration passed without penalty', async () => {
      await time.increase(new BN(duration));

      let totalPoints1 = await swiseStaking.totalPoints();
      let receipt = await swiseStaking.withdrawPosition({ from: account1 });
      let totalPoints2 = await swiseStaking.totalPoints();

      expectEvent(receipt, 'PositionWithdrawn', {
        owner: account1,
        ethReward: new BN(0),
        swiseReward: new BN(0),
        swisePenalty: new BN(0),
      });
      expect(totalPoints1.gt(totalPoints2)).to.equal(true);
      expect(await token.balanceOf(account1)).to.bignumber.equal(amount);
    });
  });
});
