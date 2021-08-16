const {
  BN,
  expectRevert,
  expectEvent,
  ether,
  balance,
  send,
  constants,
} = require('@openzeppelin/test-helpers');
const { keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings, contracts } = require('../../deployments/settings');
const { vrcAbi } = require('../../deployments/vrc');
const {
  initializeValidator,
  finalizeValidator,
  setupOracleAccounts,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkValidatorRegistered,
} = require('../utils');
const {
  initializeData,
  initializeMerkleRoot,
} = require('./initializeMerkleRoot');
const { finalizeData, finalizeMerkleRoot } = require('./finalizeMerkleRoot');

const Pool = artifacts.require('Pool');
const PoolValidators = artifacts.require('PoolValidators');
const Oracles = artifacts.require('Oracles');

contract('Pool Validators', (accounts) => {
  const admin = contractSettings.admin;
  const validatorDeposit = ether('32');
  const initializeMerkleProofs =
    'ipfs://QmSYduvpsJp7bo3xenRK3qDdoLkzWcvVeU3U16v1n3Cb5d';
  const finalizeMerkleProofs =
    'ipfs://QmSTP443zR6oKnYVRE23RARyuuzwhhaidUiSXyRTsw3pDs';
  let pool,
    validators,
    vrc,
    initAmount,
    finalizeAmount,
    oracleAccounts,
    oracles;
  let [operator, anyone, ...otherAccounts] = accounts;

  before(async () => {
    vrc = new web3.eth.Contract(vrcAbi, contractSettings.VRC);
  });

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    pool = await Pool.at(contracts.pool);
    initAmount = await pool.VALIDATOR_INIT_DEPOSIT();
    finalizeAmount = (await pool.VALIDATOR_TOTAL_DEPOSIT()).sub(initAmount);

    validators = await PoolValidators.at(upgradedContracts.poolValidators);

    // collect validator deposit
    let poolBalance = await balance.current(pool.address);
    let depositAmount = validatorDeposit.sub(poolBalance);
    await pool.stake(anyone, {
      from: anyone,
      value: depositAmount,
    });

    oracles = await Oracles.at(upgradedContracts.oracles);
    oracleAccounts = await setupOracleAccounts({
      admin,
      oracles,
      accounts: otherAccounts,
    });
  });

  afterEach(async () => resetFork());

  describe('add operator', () => {
    it('fails to add with not admin privilege', async () => {
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          initializeMerkleProofs,
          finalizeMerkleRoot,
          finalizeMerkleProofs,
          {
            from: anyone,
          }
        ),
        'OwnablePausable: access denied'
      );
    });

    it('fails to add with zero operator address', async () => {
      await expectRevert(
        validators.addOperator(
          constants.ZERO_ADDRESS,
          initializeMerkleRoot,
          initializeMerkleProofs,
          finalizeMerkleRoot,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to add with invalid merkle roots', async () => {
      await expectRevert(
        validators.addOperator(
          operator,
          constants.ZERO_BYTES32,
          initializeMerkleProofs,
          finalizeMerkleRoot,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle roots'
      );
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          initializeMerkleProofs,
          constants.ZERO_BYTES32,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle roots'
      );

      // same merkle roots
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          initializeMerkleProofs,
          initializeMerkleRoot,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle roots'
      );
    });

    it('fails to add with invalid merkle proofs', async () => {
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          '',
          finalizeMerkleRoot,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle proofs'
      );
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          initializeMerkleProofs,
          finalizeMerkleRoot,
          '',
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle proofs'
      );

      // same merkle roots
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot,
          initializeMerkleProofs,
          finalizeMerkleRoot,
          initializeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle proofs'
      );
    });

    it('fails to update with locked operator', async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );

      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });

      let {
        publicKey,
        signature,
        withdrawalCredentials,
        merkleProof,
        depositDataRoot,
      } = initializeData[0];
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      let initializeMerkleRoot2 =
        '0x2a6d4eed3ba81bd99efdfd31333e244bb84989cfadbf9ddbf8fabd7296099bc0';
      let finalizeMerkleRoot2 =
        '0xd7a7db4c225d87bb434aa5348ddc690f01c553fec86869383af30aa83b5b1d87';
      await expectRevert(
        validators.addOperator(
          operator,
          initializeMerkleRoot2,
          initializeMerkleProofs,
          finalizeMerkleRoot2,
          finalizeMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: operator locked'
      );
    });

    it('can update existing operator', async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );

      let initializeMerkleRoot2 =
        '0x2a6d4eed3ba81bd99efdfd31333e244bb84989cfadbf9ddbf8fabd7296099bc0';
      let finalizeMerkleRoot2 =
        '0xd7a7db4c225d87bb434aa5348ddc690f01c553fec86869383af30aa83b5b1d87';

      let receipt = await validators.addOperator(
        operator,
        initializeMerkleRoot2,
        initializeMerkleProofs,
        finalizeMerkleRoot2,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OperatorAdded', {
        operator,
        initializeMerkleRoot: initializeMerkleRoot2,
        initializeMerkleProofs,
        finalizeMerkleRoot: finalizeMerkleRoot2,
        finalizeMerkleProofs,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(initializeMerkleRoot2);
      expect(_operator[1]).to.equal(finalizeMerkleRoot2);
      expect(_operator[2]).to.equal(false);
    });

    it('can add new operator', async () => {
      let receipt = await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OperatorAdded', {
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(initializeMerkleRoot);
      expect(_operator[1]).to.equal(finalizeMerkleRoot);
      expect(_operator[2]).to.equal(false);
    });
  });

  describe('remove operator', () => {
    beforeEach(async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );
    });

    it('fails to remove by user other than admin and operator', async () => {
      await expectRevert(
        validators.removeOperator(operator, {
          from: anyone,
        }),
        'PoolValidators: access denied'
      );
    });

    it('fails to remove not existing operator', async () => {
      await expectRevert(
        validators.removeOperator(anyone, {
          from: admin,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to remove locked operator', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });

      let {
        publicKey,
        signature,
        withdrawalCredentials,
        merkleProof,
        depositDataRoot,
      } = initializeData[0];
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectRevert(
        validators.removeOperator(operator, {
          from: admin,
        }),
        'PoolValidators: operator is locked'
      );
    });

    it('operator or admin can remove operator', async () => {
      let receipt = await validators.removeOperator(operator, {
        from: admin,
      });

      await expectEvent(receipt, 'OperatorRemoved', {
        sender: admin,
        operator,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(constants.ZERO_BYTES32);
      expect(_operator[1]).to.equal(constants.ZERO_BYTES32);
      expect(_operator[2]).to.equal(false);
    });
  });

  describe('deposit collateral', () => {
    it('fails to deposit with zero operator address', async () => {
      await expectRevert(
        validators.depositCollateral(constants.ZERO_ADDRESS, {
          value: initAmount,
          from: anyone,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to deposit when collateral exists', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
      await expectRevert(
        validators.depositCollateral(operator, {
          value: initAmount,
          from: anyone,
        }),
        'PoolValidators: collateral exists'
      );
    });

    it('fails to deposit with invalid collateral value', async () => {
      await expectRevert(
        validators.depositCollateral(operator, {
          value: initAmount.sub(new BN(1)),
          from: anyone,
        }),
        'PoolValidators: invalid collateral'
      );
    });

    it('anyone can deposit collateral', async () => {
      let receipt = await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });

      await expectEvent(receipt, 'CollateralDeposited', {
        operator,
        collateral: initAmount,
      });

      let collateral = await validators.collaterals(operator);
      expect(collateral).to.bignumber.equal(initAmount);
    });
  });

  describe('withdraw collateral', () => {
    const collateralRecipient = otherAccounts[0];
    beforeEach(async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
    });

    it('fails to withdraw with zero recipient address', async () => {
      await expectRevert(
        validators.withdrawCollateral(constants.ZERO_ADDRESS, {
          from: operator,
        }),
        'PoolValidators: invalid collateral recipient'
      );
    });

    it('fails to withdraw for the existing operator', async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );
      await expectRevert(
        validators.withdrawCollateral(collateralRecipient, {
          from: operator,
        }),
        'PoolValidators: operator exists'
      );
    });

    it('fails to withdraw twice', async () => {
      await validators.withdrawCollateral(collateralRecipient, {
        from: operator,
      });
      await expectRevert(
        validators.withdrawCollateral(collateralRecipient, {
          from: operator,
        }),
        'PoolValidators: collateral does not exist'
      );
    });

    it('operator can withdraw collateral', async () => {
      let currentBalance = await balance.current(collateralRecipient);
      let receipt = await validators.withdrawCollateral(collateralRecipient, {
        from: operator,
      });

      await expectEvent(receipt, 'CollateralWithdrawn', {
        operator,
        collateralRecipient,
        collateral: initAmount,
      });

      let collateral = await validators.collaterals(operator);
      expect(collateral).to.bignumber.equal(new BN(0));
      expect(await balance.current(collateralRecipient)).to.bignumber.equal(
        currentBalance.add(initAmount)
      );
    });
  });

  describe('slash operator', () => {
    let {
      publicKey,
      signature,
      withdrawalCredentials,
      merkleProof,
      depositDataRoot,
    } = initializeData[0];
    beforeEach(async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
    });

    it('fails to slash by user other than admin', async () => {
      await expectRevert(
        validators.slashOperator(
          {
            operator,
            withdrawalCredentials,
            depositDataRoot,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: anyone,
          }
        ),
        'OwnablePausable: access denied'
      );
    });

    it('fails to slash not locked operator', async () => {
      await expectRevert(
        validators.slashOperator(
          {
            operator,
            withdrawalCredentials,
            depositDataRoot,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to slash not added operator', async () => {
      await expectRevert(
        validators.slashOperator(
          {
            operator: anyone,
            withdrawalCredentials,
            depositDataRoot,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to slash operator with invalid deposit data', async () => {
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });
      await expectRevert(
        validators.slashOperator(
          {
            operator,
            withdrawalCredentials,
            depositDataRoot: constants.ZERO_BYTES32,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle proof'
      );
    });

    it('fails to slash operator with invalid validator status', async () => {
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });
      await expectRevert(
        validators.slashOperator(
          {
            operator,
            withdrawalCredentials: initializeData[1].withdrawalCredentials,
            depositDataRoot: initializeData[1].depositDataRoot,
            publicKey: initializeData[1].publicKey,
            signature: initializeData[1].signature,
          },
          initializeData[1].merkleProof,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid validator status'
      );
    });

    it('admin can slash operator', async () => {
      let poolBalance = await balance.current(pool.address);
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(initAmount)
      );

      let receipt = await validators.slashOperator(
        {
          operator,
          withdrawalCredentials,
          depositDataRoot,
          publicKey,
          signature,
        },
        merkleProof,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OperatorSlashed', {
        operator,
        publicKey: keccak256(publicKey),
        refundedAmount: initAmount,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(constants.ZERO_BYTES32);
      expect(_operator[1]).to.equal(constants.ZERO_BYTES32);
      expect(_operator[2]).to.equal(false);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance
      );
    });
  });

  describe('initialize validator', () => {
    let {
      publicKey,
      signature,
      withdrawalCredentials,
      merkleProof,
      depositDataRoot,
    } = initializeData[0];

    beforeEach(async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );
    });

    it('fails to initialize validator by not oracles', async () => {
      await expectRevert(
        validators.initializeValidator(
          {
            operator,
            withdrawalCredentials,
            depositDataRoot,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: anyone,
          }
        ),
        'PoolValidators: access denied'
      );
    });

    it('fails to initialize twice', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectRevert(
        initializeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid validator status'
      );
    });

    it('fails to initialize without collateral', async () => {
      await expectRevert(
        initializeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid operator collateral'
      );
    });

    it('fails to initialize for invalid operator', async () => {
      await expectRevert(
        initializeValidator({
          operator: anyone,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to initialize for invalid deposit data', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
      await expectRevert(
        initializeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot: constants.ZERO_BYTES32,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid merkle proof'
      );
    });

    it('fails to initialize for already locked operator', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectRevert(
        initializeValidator({
          operator,
          merkleProof: initializeData[1].merkleProof,
          signature: initializeData[1].signature,
          publicKey: initializeData[1].publicKey,
          withdrawalCredentials: initializeData[1].withdrawalCredentials,
          depositDataRoot: initializeData[1].depositDataRoot,
          oracles,
          oracleAccounts,
        }),
        'PoolValidators: operator already locked'
      );
    });

    it('oracles can initialize validator', async () => {
      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });

      let poolBalance = await balance.current(pool.address);
      let receipt = await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectEvent.inTransaction(
        receipt.tx,
        Pool,
        'ValidatorInitialized',
        {
          operator,
          publicKey: keccak256(publicKey),
        }
      );
      expect(
        await validators.validatorStatuses(
          keccak256(defaultAbiCoder.encode(['bytes'], [publicKey]))
        )
      ).to.bignumber.equal(new BN('1'));
      let _operator = await validators.getOperator(operator);
      expect(_operator[2]).to.equal(true);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(initAmount)
      );
    });
  });

  describe('finalize validator', () => {
    let {
      publicKey,
      signature,
      withdrawalCredentials,
      merkleProof,
      depositDataRoot,
    } = finalizeData[0];

    beforeEach(async () => {
      await validators.addOperator(
        operator,
        initializeMerkleRoot,
        initializeMerkleProofs,
        finalizeMerkleRoot,
        finalizeMerkleProofs,
        {
          from: admin,
        }
      );

      await validators.depositCollateral(operator, {
        value: initAmount,
        from: anyone,
      });

      let {
        publicKey,
        signature,
        withdrawalCredentials,
        merkleProof,
        depositDataRoot,
      } = initializeData[0];
      await initializeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });
    });

    it('fails to finalize validator by not oracles', async () => {
      await expectRevert(
        validators.finalizeValidator(
          {
            operator,
            withdrawalCredentials,
            depositDataRoot,
            publicKey,
            signature,
          },
          merkleProof,
          {
            from: anyone,
          }
        ),
        'PoolValidators: access denied'
      );
    });

    it('fails to finalize twice', async () => {
      await finalizeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectRevert(
        finalizeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid validator status'
      );
    });

    it('fails to finalize not initialized validator', async () => {
      let {
        publicKey,
        signature,
        withdrawalCredentials,
        merkleProof,
        depositDataRoot,
      } = finalizeData[1];

      await expectRevert(
        finalizeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid validator status'
      );
    });

    it('fails to finalize for invalid operator', async () => {
      await expectRevert(
        finalizeValidator({
          operator: anyone,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to finalize for invalid deposit data', async () => {
      await expectRevert(
        finalizeValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot: constants.ZERO_BYTES32,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
        }),
        'PoolValidators: invalid merkle proof'
      );
    });

    it('oracles can finalize validator', async () => {
      let poolBalance = await balance.current(pool.address);
      let receipt = await finalizeValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'ValidatorRegistered', {
        operator,
        publicKey: keccak256(publicKey),
      });
      expect(
        await validators.validatorStatuses(
          keccak256(defaultAbiCoder.encode(['bytes'], [publicKey]))
        )
      ).to.bignumber.equal(new BN('2'));

      let _operator = await validators.getOperator(operator);
      expect(_operator[2]).to.equal(false);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(finalizeAmount)
      );
      await checkValidatorRegistered({
        vrc,
        operator,
        transaction: receipt.tx,
        pubKey: publicKey,
        withdrawalCredentials,
        signature,
        validatorDepositAmount: finalizeAmount,
      });
    });
  });
});
