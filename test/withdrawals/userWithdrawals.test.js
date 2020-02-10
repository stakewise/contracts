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
const {
  removeNetworkFile,
  getDepositAmount,
  registerValidator,
  validatorRegistrationArgs
} = require('../utils');

const WalletsRegistry = artifacts.require('WalletsRegistry');
const Withdrawals = artifacts.require('Withdrawals');
const Operators = artifacts.require('Operators');
const Privates = artifacts.require('Privates');
const Pools = artifacts.require('Pools');
const WalletsManagers = artifacts.require('WalletsManagers');
const Settings = artifacts.require('Settings');

contract('User Withdrawals', ([_, ...accounts]) => {
  let networkConfig,
    proxies,
    settings,
    walletsRegistry,
    wallet,
    withdrawals,
    validatorId,
    vrc;
  let [
    admin,
    operator,
    transfersManager,
    walletsManager,
    other,
    sender,
    ...otherAccounts
  ] = accounts;

  before(async () => {
    networkConfig = await getNetworkConfig();
    await deployLogicContracts({ networkConfig });
    vrc = await deployVRC({ from: admin });
  });

  after(() => {
    removeNetworkFile(networkConfig.network);
  });

  beforeEach(async () => {
    proxies = await deployAllProxies({
      initialAdmin: admin,
      transfersManager,
      networkConfig,
      vrc: vrc.options.address
    });
    let operators = await Operators.at(proxies.operators);
    await operators.addOperator(operator, { from: admin });

    let walletsManagers = await WalletsManagers.at(proxies.walletsManagers);
    await walletsManagers.addManager(walletsManager, { from: admin });

    withdrawals = await Withdrawals.at(proxies.withdrawals);
    walletsRegistry = await WalletsRegistry.at(proxies.walletsRegistry);
    settings = await Settings.at(proxies.settings);
    validatorId = await registerValidator({
      poolsProxy: proxies.pools,
      operator,
      sender: other,
      withdrawer: other
    });
    const { logs } = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    wallet = logs[0].args.wallet;
  });

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
      from: walletsManager
    });

    await expectRevert(
      withdrawals.withdraw(wallet, other, {
        from: otherAccounts[0]
      }),
      'User does not have a share in this wallet.'
    );
  });

  it('user cannot withdraw from the same wallet multiple times', async () => {
    // enable withdrawals
    await send.ether(other, wallet, initialSettings.validatorDepositAmount);
    await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
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
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: userDeposits[j]
        });
      }

      // Create validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[i + 1],
        hasReadyEntity: true,
        poolsProxy: proxies.pools,
        operator
      });

      // Time for withdrawal, assign wallet
      let receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, penalized deposit returned
      const walletBalance = penalizedValidators[i];
      await send.ether(other, wallet, walletBalance);

      // Enable withdrawals, check whether penalty calculated properly
      await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });

      for (let j = 0; j < userDeposits.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his penalized deposit
        let receipt = await withdrawals.withdraw(wallet, otherAccounts[j], {
          from: sender
        });

        const correctUserReturn = userPenalizedDeposits[j][i];
        expectEvent(receipt, 'UserWithdrawn', {
          wallet,
          sender: sender,
          withdrawer: otherAccounts[j],
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
        await pools.addDeposit(otherAccounts[j], {
          from: sender,
          value: userDeposits[j]
        });
      }

      // Create validator
      let validatorId = await registerValidator({
        args: validatorRegistrationArgs[i + 1],
        hasReadyEntity: true,
        poolsProxy: proxies.pools,
        operator
      });

      // Time for withdrawal, assign wallet
      receipt = await walletsRegistry.assignWallet(validatorId, {
        from: walletsManager
      });
      let wallet = receipt.logs[0].args.wallet;

      // Withdrawal performed, deposit and rewards returned
      const walletBalance = validatorReturns[i];
      await send.ether(other, wallet, walletBalance);

      // Enable withdrawals
      receipt = await withdrawals.enableWithdrawals(wallet, {
        from: walletsManager
      });

      // Maintainer has withdrawn correct fee
      if (expectedMaintainerRewards[i].gt(new BN(0))) {
        expectEvent(receipt, 'MaintainerWithdrawn', {
          maintainer: initialSettings.maintainer,
          wallet,
          amount: expectedMaintainerRewards[i]
        });
      }
      walletBalance.isub(expectedMaintainerRewards[i]);

      for (let j = 0; j < userDeposits.length; j++) {
        // track user's balance
        const userBalance = await balance.tracker(otherAccounts[j]);

        // User withdraws his deposit and rewards
        receipt = await withdrawals.withdraw(wallet, otherAccounts[j], {
          from: sender
        });

        const expectedUserReward = expectedUserRewards[j][i];
        expectEvent(receipt, 'UserWithdrawn', {
          wallet,
          sender: sender,
          withdrawer: otherAccounts[j],
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
      await pools.addDeposit(otherAccounts[deposits.length], {
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
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[1],
      hasReadyEntity: true,
      poolsProxy: proxies.pools,
      operator
    });

    // Time for withdrawal, assign wallet
    let receipt = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    let wallet = receipt.logs[0].args.wallet;

    // Withdrawal performed, deposit and rewards returned
    const walletBalance = getDepositAmount({
      min: validatorDepositAmount
    });
    await send.ether(other, wallet, walletBalance);

    // Enable withdrawals
    let { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });

    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validator: validatorId,
      wallet,
      balance: walletBalance
    });

    for (let i = 0; i < deposits.length; i++) {
      let withdrawer = otherAccounts[i];

      // User withdraws his deposit and rewards
      let receipt = await withdrawals.withdraw(wallet, withdrawer, {
        from: sender
      });
      expectEvent(receipt, 'UserWithdrawn', {
        wallet,
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

  it('can withdraw private deposits from rewarded validator', async () => {
    let privates = await Privates.at(proxies.privates);

    const maintainerFee = new BN(2000);
    const validatorDepositAmount = new BN(
      initialSettings.validatorDepositAmount
    );
    await settings.setMaintainerFee(maintainerFee, { from: admin });

    const withdrawerBalance = await balance.tracker(otherAccounts[0]);
    const reward = ether('2.316109214');
    let expectedMaintainerReward = ether('0.4632218428');
    let expectedUserReward = ether('1.8528873712');

    // User performs deposit equal to validator deposit amount
    await privates.addDeposit(otherAccounts[0], {
      from: sender,
      value: validatorDepositAmount
    });

    // Start validator
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[1],
      hasReadyEntity: true,
      privatesProxy: proxies.privates,
      operator
    });

    // Time for withdrawal, assign wallet
    let receipt = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    let wallet = receipt.logs[0].args.wallet;

    // Withdrawal performed, deposit and rewards returned
    await send.ether(other, wallet, validatorDepositAmount.add(reward));

    // Enable withdrawals
    receipt = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    await expectEvent.inTransaction(
      receipt.tx,
      walletsRegistry,
      'WalletUnlocked',
      {
        validator: validatorId,
        wallet,
        balance: validatorDepositAmount.add(reward)
      }
    );

    // maintainer's reward calculated properly
    expectEvent(receipt, 'MaintainerWithdrawn', {
      maintainer: initialSettings.maintainer,
      wallet,
      amount: expectedMaintainerReward
    });

    // User withdraws his deposit and rewards
    receipt = await withdrawals.withdraw(wallet, otherAccounts[0], {
      from: sender
    });

    expectEvent(receipt, 'UserWithdrawn', {
      wallet,
      sender,
      withdrawer: otherAccounts[0],
      deposit: validatorDepositAmount
    });
    // User's balance has changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(
      validatorDepositAmount.add(expectedUserReward)
    );

    // all deposits have been withdrawn
    expect(
      await withdrawals.validatorLeftDeposits(validatorId)
    ).to.be.bignumber.equal(new BN(0));

    // wallet is empty
    expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
  });

  it('can withdraw private deposit from penalised validator', async () => {
    const validatorDepositAmount = new BN(
      initialSettings.validatorDepositAmount
    );
    let privates = await Privates.at(proxies.privates);
    const withdrawerBalance = await balance.tracker(otherAccounts[0]);

    // User performs deposit equal to validator deposit amount
    await privates.addDeposit(otherAccounts[0], {
      from: sender,
      value: validatorDepositAmount
    });

    // Start validator
    let validatorId = await registerValidator({
      args: validatorRegistrationArgs[1],
      hasReadyEntity: true,
      privatesProxy: proxies.privates,
      operator
    });

    // Time for withdrawal, assign wallet
    let receipt = await walletsRegistry.assignWallet(validatorId, {
      from: walletsManager
    });
    let wallet = receipt.logs[0].args.wallet;

    // Withdrawal performed, penalized deposit returned
    let penalisedBalance = ether('31.470154442');
    await send.ether(other, wallet, penalisedBalance);

    // Enable withdrawals
    let { tx } = await withdrawals.enableWithdrawals(wallet, {
      from: walletsManager
    });
    await expectEvent.inTransaction(tx, walletsRegistry, 'WalletUnlocked', {
      validator: validatorId,
      wallet,
      balance: penalisedBalance
    });

    // User withdraws his penalised deposit
    receipt = await withdrawals.withdraw(wallet, otherAccounts[0], {
      from: sender
    });

    expectEvent(receipt, 'UserWithdrawn', {
      wallet,
      sender,
      withdrawer: otherAccounts[0],
      deposit: penalisedBalance
    });
    // User's balance has changed
    expect(await withdrawerBalance.delta()).to.be.bignumber.equal(
      penalisedBalance
    );

    // all deposits have been withdrawn
    expect(
      await withdrawals.validatorLeftDeposits(validatorId)
    ).to.be.bignumber.equal(new BN(0));

    // wallet is empty
    expect(await balance.current(wallet)).to.be.bignumber.equal(new BN(0));
  });
});
