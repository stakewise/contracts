const { expect } = require('chai');
const {
  BN,
  send,
  expectRevert,
  balance,
  ether,
  expectEvent,
  constants
} = require('@openzeppelin/test-helpers');
const { deployAllProxies } = require('../../deployments');
const {
  getNetworkConfig,
  deployLogicContracts
} = require('../../deployments/common');
const { initialSettings } = require('../../deployments/settings');
const { deployVRC } = require('../../deployments/vrc');
const { removeNetworkFile, getDepositAmount } = require('../utils');
const { createValidator } = require('./common');

const WalletsManager = artifacts.require('WalletsManager');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Pools = artifacts.require('Pools');
const Settings = artifacts.require('Settings');

contract('Withdrawals', ([_, admin, operator, other, sender, ...accounts]) => {
  let networkConfig;
  let proxies;
  let settings;
  let walletsManager;
  let wallet;
  let withdrawals;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    let vrc = await deployVRC({ from: admin });
    proxies = await deployAllProxies({
      initialAdmin: admin,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });
    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsManager = await WalletsManager.at(proxies.walletsManager);
    settings = await Settings.at(proxies.settings);
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    let validatorId = await createValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });
    const { logs } = await walletsManager.assignWallet(validatorId, {
      from: admin
    });
    wallet = logs[0].args.wallet;
  });

  describe('enabling withdrawals', () => {
    it('user without admin role cannot enable withdrawals', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: operator
        }),
        'Permission denied.'
      );
    });

    it('cannot enable withdrawals for wallet not assigned to any validator', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(constants.ZERO_ADDRESS, {
          from: admin
        }),
        'Wallet is not assigned to any validator.'
      );
    });

    it('cannot enable withdrawals for wallet with zero balance', async () => {
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: admin
        }),
        'Wallet has no ether in it.'
      );
    });

    it('cannot enable withdrawals for already unlocked wallet', async () => {
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });
      await expectRevert(
        withdrawals.enableWithdrawals(wallet, {
          from: admin
        }),
        'Wallet is already unlocked.'
      );
    });

    it("penalty is not applied if balance is not less than validator's deposit", async () => {
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);
      const receipt = await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });
      expectEvent(receipt, 'WithdrawalsEnabled', {
        penalty: new BN(0),
        wallet
      });
    });

    it('calculates penalties correctly', async () => {
      let tests = [
        // withdrawal return, correct penalty
        [ether('16'), ether('0.5')], // biggest slash possible
        [ether('31.999999999999999999'), ether('0.999999999999999999')], // smallest slash possible
        [ether('31.470154444639959214'), ether('0.983442326394998725')],
        [ether('22.400020050000300803'), ether('0.7000006265625094')],
        [ether('26.037398137005555372'), ether('0.813668691781423605')],
        [ether('18.345'), ether('0.57328125')],
        [ether('16.00145'), ether('0.5000453125')],
        [ether('31.987654321'), ether('0.99961419753125')]
      ];

      for (let i = 0; i < tests.length; i++) {
        // Collect deposits, create validator
        let validatorId = await createValidator({
          poolsProxy: proxies.pools,
          operator,
          sender: other,
          withdrawer: other
        });

        // Time for withdrawal, assign wallet
        let receipt = await walletsManager.assignWallet(validatorId, {
          from: admin
        });
        let wallet = receipt.logs[0].args.wallet;

        const [withdrawalReturn, expectedPenalty] = tests[i];

        // Withdrawal performed, penalized deposit returned
        await send.ether(other, wallet, withdrawalReturn);

        // Enable withdrawals, check whether penalty calculated properly
        receipt = await withdrawals.enableWithdrawals(wallet, {
          from: admin
        });
        expectEvent(receipt, 'WithdrawalsEnabled', {
          penalty: expectedPenalty,
          wallet
        });
      }
    });

    it('unlocks the wallet for withdrawals', async () => {
      // initially wallet is locked
      expect((await walletsManager.wallets(wallet)).unlocked).to.be.equal(
        false
      );
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);

      // enable withdrawals
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      // wallet must be unlocked
      expect((await walletsManager.wallets(wallet)).unlocked).to.be.equal(true);
    });

    it("doesn't send maintainer's reward when no profit", async () => {
      // start tracking maintainer's balance
      const maintainerBalance = await balance.tracker(
        initialSettings.maintainer
      );
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);

      // enable withdrawals
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      // maintainer's balance hasn't changed
      expect(await maintainerBalance.delta()).to.be.bignumber.equal('0');
    });

    it("doesn't send maintainer's reward when profit is less than gas required to send", async () => {
      // start tracking maintainer's balance
      const maintainerBalance = await balance.tracker(
        initialSettings.maintainer
      );
      await send.ether(
        other,
        wallet,
        new BN(initialSettings.validatorDepositAmount).add(new BN('0.000025'))
      );

      // enable withdrawals
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      // maintainer's balance hasn't changed
      expect(await maintainerBalance.delta()).to.be.bignumber.equal('0');
    });

    it("calculates maintainer's reward correctly", async () => {
      let tests = [
        // validator reward, maintainer's fee, expected maintainer's reward
        ['20884866385064848799', '9561', '19968020750760501936'],
        ['35901110095648257832', '7337', '26340644477177126771'],
        ['13050766221027247901', '9999', '13049461144405145176'],
        ['43915781067913393044', '6465', '28391552460406008602'],
        ['55282543863516569837', '8625', '47681194082283041484'],
        ['25619926040557835738', '4200', '10760368937034291009'],
        ['98340000673116247278', '65', '639210004375255607'],
        ['28044828751583387617', '453', '1270430742446727459'],
        ['57667042368295430137', '8', '46133633894636344'],
        ['31626521340343186340', '9876', '31234352475722930829']
      ];

      // start tracking maintainer's balance
      const maintainer = initialSettings.maintainer;
      const maintainerBalance = await balance.tracker(maintainer);

      const validatorDepositAmount = new BN(
        initialSettings.validatorDepositAmount
      );

      // run tests
      let receipt;
      for (let i = 0; i < tests.length; i++) {
        const [
          validatorReward,
          maintainerFee,
          expectedMaintainerReward
        ] = tests[i];

        // set maintainer's fee
        await settings.setMaintainerFee(maintainerFee, { from: admin });

        // collect deposits, create validator
        let validatorId = await createValidator({
          poolsProxy: proxies.pools,
          operator,
          sender: other,
          withdrawer: other
        });

        // time for withdrawal, assign wallet
        receipt = await walletsManager.assignWallet(validatorId, {
          from: admin
        });
        let wallet = receipt.logs[0].args.wallet;

        // validator receives deposits and rewards from network
        await send.ether(
          other,
          wallet,
          validatorDepositAmount.add(new BN(validatorReward))
        );

        // enable withdrawals
        receipt = await withdrawals.enableWithdrawals(wallet, {
          from: admin
        });
        expectEvent(receipt, 'WithdrawalsEnabled', {
          penalty: '0',
          wallet
        });

        // maintainer's reward calculated properly
        expectEvent(receipt, 'MaintainerWithdrawn', {
          maintainer,
          validator: validatorId,
          amount: expectedMaintainerReward
        });

        // maintainer's balance changed
        expect(await maintainerBalance.delta()).to.be.bignumber.equal(
          new BN(expectedMaintainerReward)
        );

        // wallet's balance changed
        expect(await balance.current(wallet)).to.be.bignumber.equal(
          validatorDepositAmount
            .add(new BN(validatorReward))
            .sub(new BN(expectedMaintainerReward))
        );

        // wallet unlocked
        expect((await walletsManager.wallets(wallet)).unlocked).to.be.equal(
          true
        );
      }
    });
  });

  describe('user withdrawals', () => {
    it('user cannot withdraw from unknown wallet', async () => {
      await expectRevert(
        withdrawals.withdraw(constants.ZERO_ADDRESS, other, {
          from: other
        }),
        'Wallet withdrawals are not enabled.'
      );
    });

    it('user cannot withdraw from locked wallet', async () => {
      await expectRevert(
        withdrawals.withdraw(wallet, other, {
          from: other
        }),
        'Wallet withdrawals are not enabled.'
      );
    });

    it('user not holding share cannot withdraw from wallet', async () => {
      // enable withdrawals
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      await expectRevert(
        withdrawals.withdraw(wallet, other, {
          from: accounts[0]
        }),
        'User does not have a share in this wallet.'
      );
    });

    it('user cannot withdraw from the same wallet multiple times', async () => {
      // enable withdrawals
      await send.ether(other, wallet, initialSettings.validatorDepositAmount);
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      // user performs withdrawal first time
      await withdrawals.withdraw(wallet, other, {
        from: other
      });

      // user performs withdrawal second time
      await expectRevert(
        withdrawals.withdraw(wallet, other, {
          from: other
        }),
        'The withdrawal has already been performed.'
      );
    });

    it('user can withdraw deposit from penalized validator', async () => {
      // penalized validator withdrawal returns
      let penalizedValidators = [
        ether('16'), // biggest slash possible
        ether('31.999999999999999999'), // smallest slash possible
        ether('31.470154444639959214'),
        ether('18.345'),
        ether('26.037398137005555372'),
        ether('31.987654321')
      ];

      // user deposit amounts
      let userDeposits = [
        ether('0.001'),
        ether('1'),
        ether('18.999'),
        ether('3.01'),
        ether('2.9'),
        ether('6.09')
      ];

      // correct return amounts for every user in every penalized validator
      let userPenalizedDeposits = [
        [
          ether('0.0005'),
          ether('0.000999999999999999'),
          ether('0.000983442326394998'),
          ether('0.00057328125'),
          ether('0.000813668691781423'),
          ether('0.00099961419753125')
        ],
        [
          ether('0.5'),
          ether('0.999999999999999999'),
          ether('0.983442326394998725'),
          ether('0.57328125'),
          ether('0.813668691781423605'),
          ether('0.99961419753125')
        ],
        [
          ether('9.4995'),
          ether('18.998999999999999981'),
          ether('18.684420759178580776'),
          ether('10.89177046875'),
          ether('15.458891475155267071'),
          ether('18.99167013889621875')
        ],
        [
          ether('1.505'),
          ether('3.009999999999999996'),
          ether('2.960161402448946162'),
          ether('1.7255765625'),
          ether('2.449142762262085051'),
          ether('3.0088387345690625')
        ],
        [
          ether('1.45'),
          ether('2.899999999999999997'),
          ether('2.851982746545496302'),
          ether('1.662515625'),
          ether('2.359639206166128454'),
          ether('2.898881172840625')
        ],
        [
          ether('3.045'),
          ether('6.089999999999999993'),
          ether('5.989163767745542235'),
          ether('3.4912828125'),
          ether('4.955242332948869754'),
          ether('6.0876504629653125')
        ]
      ];

      let pools = await Pools.at(proxies.pools);
      for (let i = 0; i < penalizedValidators.length; i++) {
        // Populate pool with deposits
        for (let j = 0; j < userDeposits.length; j++) {
          await pools.addDeposit(accounts[j], {
            from: sender,
            value: userDeposits[j]
          });
        }

        // Create validator
        let validatorId = await createValidator({
          hasReadyPool: true,
          poolsProxy: proxies.pools,
          operator
        });

        // Time for withdrawal, assign wallet
        let receipt = await walletsManager.assignWallet(validatorId, {
          from: admin
        });
        let wallet = receipt.logs[0].args.wallet;

        // Withdrawal performed, penalized deposit returned
        const walletBalance = penalizedValidators[i];
        await send.ether(other, wallet, walletBalance);

        // Enable withdrawals, check whether penalty calculated properly
        await withdrawals.enableWithdrawals(wallet, {
          from: admin
        });

        for (let j = 0; j < userDeposits.length; j++) {
          // track user's balance
          const userBalance = await balance.tracker(accounts[j]);

          // User withdraws his penalized deposit
          let receipt = await withdrawals.withdraw(wallet, accounts[j], {
            from: sender
          });

          const correctUserReturn = userPenalizedDeposits[j][i];
          expectEvent(receipt, 'UserWithdrawn', {
            sender: sender,
            withdrawer: accounts[j],
            deposit: correctUserReturn,
            reward: new BN(0)
          });

          // User's balance has changed
          expect(await userBalance.delta()).to.be.bignumber.equal(
            correctUserReturn
          );

          // Wallet's balance has changed
          expect(await balance.current(wallet)).to.be.bignumber.equal(
            walletBalance.isub(correctUserReturn)
          );
        }
      }
    });

    it('user can withdraw deposit and reward from validator', async () => {
      // validator withdrawal returns
      let validatorReturns = [
        new BN(initialSettings.validatorDepositAmount),
        ether('34.882831212835020153'),
        ether('32.08486'),
        ether('37.011386912'),
        ether('32.268649703878297201')
      ];

      // Set maintainer fee
      const maintainerFee = new BN(2553);
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      let expectedMaintainerRewards = [
        ether('0'),
        ether('0.735986808636780645'),
        ether('0.021664758'),
        ether('1.2794070786336'),
        ether('0.068586269400129275')
      ];

      let userDeposits = [
        ether('0.001'),
        ether('0.01'),
        ether('0.067'),
        ether('0.41'),
        ether('0.9'),
        ether('0.999'),
        ether('1.961'),
        ether('2.295'),
        ether('2.8'),
        ether('3'),
        ether('3.062'),
        ether('5.181'),
        ether('11.314')
      ];

      let expectedUserRewards = [
        [
          ether('0'),
          ether('0.000067088887631194'),
          ether('0.0000019748513125'),
          ether('0.0001166243697927'),
          ether('0.000006251982327442')
        ],
        [
          ether('0'),
          ether('0.000670888876311949'),
          ether('0.000019748513125'),
          ether('0.001166243697927'),
          ether('0.000062519823274427')
        ],
        [
          ether('0'),
          ether('0.004494955471290063'),
          ether('0.0001323150379375'),
          ether('0.0078138327761109'),
          ether('0.000418882815938664')
        ],
        [
          ether('0'),
          ether('0.027506443928789943'),
          ether('0.000809689038125'),
          ether('0.047815991615007'),
          ether('0.002563312754251526')
        ],
        [
          ether('0'),
          ether('0.060379998868075486'),
          ether('0.00177736618125'),
          ether('0.10496193281343'),
          ether('0.005626784094698472')
        ],
        [
          ether('0'),
          ether('0.067021798743563789'),
          ether('0.0019728764611875'),
          ether('0.1165077454229073'),
          ether('0.006245730345115305')
        ],
        [
          ether('0'),
          ether('0.131561308644773365'),
          ether('0.0038726834238125'),
          ether('0.2287003891634847'),
          ether('0.012260137344115228')
        ],
        [
          ether('0'),
          ether('0.153968997113592490'),
          ether('0.0045322837621875'),
          ether('0.2676529286742465'),
          ether('0.014348299441481106')
        ],
        [
          ether('0'),
          ether('0.187848885367345957'),
          ether('0.005529583675'),
          ether('0.32654823541956'),
          ether('0.017505550516839693')
        ],
        [
          ether('0'),
          ether('0.201266662893584954'),
          ether('0.0059245539375'),
          ether('0.3498731093781'),
          ether('0.018755946982328243')
        ],
        [
          ether('0'),
          ether('0.205426173926719043'),
          ether('0.006046994718875'),
          ether('0.3571038203052474'),
          ether('0.019143569886629693')
        ],
        [
          ether('0'),
          ether('0.347587526817221216'),
          ether('0.0102317046500625'),
          ether('0.6042308598959787'),
          ether('0.032391520438480876')
        ],
        [
          ether('0'),
          ether('0.759043674659340059'),
          ether('0.022343467749625'),
          ether('1.3194881198346078'),
          ether('0.070734928052687251')
        ]
      ];

      let receipt;
      let pools = await Pools.at(proxies.pools);
      for (let i = 0; i < validatorReturns.length; i++) {
        // Populate pool with deposits
        for (let j = 0; j < userDeposits.length; j++) {
          await pools.addDeposit(accounts[j], {
            from: sender,
            value: userDeposits[j]
          });
        }

        // Create validator
        let validatorId = await createValidator({
          hasReadyPool: true,
          poolsProxy: proxies.pools,
          operator
        });

        // Time for withdrawal, assign wallet
        receipt = await walletsManager.assignWallet(validatorId, {
          from: admin
        });
        let wallet = receipt.logs[0].args.wallet;

        // Withdrawal performed, deposit and rewards returned
        const walletBalance = validatorReturns[i];
        await send.ether(other, wallet, walletBalance);

        // Enable withdrawals
        receipt = await withdrawals.enableWithdrawals(wallet, {
          from: admin
        });

        // Maintainer has withdrawn correct fee
        if (expectedMaintainerRewards[i].gt(new BN(0))) {
          expectEvent(receipt, 'MaintainerWithdrawn', {
            maintainer: initialSettings.maintainer,
            validator: validatorId,
            amount: expectedMaintainerRewards[i]
          });
        }
        walletBalance.isub(expectedMaintainerRewards[i]);

        for (let j = 0; j < userDeposits.length; j++) {
          // track user's balance
          const userBalance = await balance.tracker(accounts[j]);

          // User withdraws his deposit and rewards
          receipt = await withdrawals.withdraw(wallet, accounts[j], {
            from: sender
          });

          const expectedUserReward = expectedUserRewards[j][i];
          expectEvent(receipt, 'UserWithdrawn', {
            sender: sender,
            withdrawer: accounts[j],
            deposit: userDeposits[j],
            reward: expectedUserReward
          });

          // User's balance has changed
          expect(await userBalance.delta()).to.be.bignumber.equal(
            expectedUserReward.add(userDeposits[j])
          );

          // Wallet's balance has changed
          expect(await balance.current(wallet)).to.be.bignumber.equal(
            walletBalance.isub(expectedUserReward.add(userDeposits[j]))
          );
        }

        // wallet is empty
        expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
      }
    });

    it('can withdraw with random deposits', async () => {
      let pools = await Pools.at(proxies.pools);

      // Set random maintainer fee
      const maintainerFee = new BN(Math.random().toFixed(4) * 10000);
      await settings.setMaintainerFee(maintainerFee, { from: admin });

      const validatorDepositAmount = new BN(
        initialSettings.validatorDepositAmount
      );

      // Generate random deposits to pools
      let poolsBalance = new BN(0);
      let deposits = [];
      while (poolsBalance.lt(validatorDepositAmount)) {
        let deposit = getDepositAmount({
          max: validatorDepositAmount.div(new BN(10))
        });
        await pools.addDeposit(accounts[deposits.length], {
          from: sender,
          value: deposit
        });
        poolsBalance.iadd(deposit);
        deposits.push(deposit);
      }

      // Last deposit could be split
      if (poolsBalance.gt(validatorDepositAmount)) {
        deposits[deposits.length - 1] = deposits[deposits.length - 1].sub(
          poolsBalance.sub(validatorDepositAmount)
        );
      }

      // Start validator
      let validatorId = await createValidator({
        hasReadyPool: true,
        poolsProxy: proxies.pools,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsManager.assignWallet(validatorId, {
        from: admin
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, deposit and rewards returned
      const walletBalance = getDepositAmount({
        min: validatorDepositAmount
      });
      await send.ether(other, wallet, walletBalance);

      // Enable withdrawals
      await withdrawals.enableWithdrawals(wallet, {
        from: admin
      });

      for (let i = 0; i < deposits.length; i++) {
        let withdrawer = accounts[i];

        // User withdraws his deposit and rewards
        let receipt = await withdrawals.withdraw(wallet, withdrawer, {
          from: sender
        });
        expectEvent(receipt, 'UserWithdrawn', {
          sender,
          withdrawer,
          deposit: deposits[i]
        });
      }

      // all deposits have been withdrawn
      expect(
        await withdrawals.validatorLeftDeposits(validatorId)
      ).to.be.bignumber.equal(new BN(0));

      // wallet is empty
      expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
    });
  });
});
