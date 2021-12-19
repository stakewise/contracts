const {
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
const {
  registerValidator,
  setupOracleAccounts,
  stopImpersonatingAccount,
  impersonateAccount,
  resetFork,
  checkValidatorRegistered,
} = require('../utils');
const {
  depositData,
  depositDataMerkleRoot,
} = require('./depositDataMerkleRoot');

const Pool = artifacts.require('Pool');
const PoolValidators = artifacts.require('PoolValidators');
const Oracles = artifacts.require('Oracles');
const iDepositContract = artifacts.require('IDepositContract');

contract('Pool Validators', (accounts) => {
  const admin = contractSettings.admin;
  const validatorDeposit = ether('32');
  const depositDataMerkleProofs =
    'ipfs://QmSTP443zR6oKnYVRE23RARyuuzwhhaidUiSXyRTsw3pDs';
  let pool,
    validators,
    validatorDepositAmount,
    oracleAccounts,
    oracles,
    depositContract,
    validatorsCount;
  let [operator, anyone, ...otherAccounts] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    pool = await Pool.at(contracts.pool);
    depositContract = await iDepositContract.at(
      await pool.validatorRegistration()
    );
    validatorDepositAmount = await pool.VALIDATOR_TOTAL_DEPOSIT();
    validatorsCount = keccak256(await depositContract.get_deposit_count());

    validators = await PoolValidators.at(upgradedContracts.poolValidators);

    // collect validator deposit
    let poolBalance = await balance.current(pool.address);
    let depositAmount = validatorDeposit.sub(poolBalance);
    await pool.stake({
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
          depositDataMerkleRoot,
          depositDataMerkleProofs,
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
          depositDataMerkleRoot,
          depositDataMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to add with invalid merkle root', async () => {
      await expectRevert(
        validators.addOperator(
          operator,
          constants.ZERO_BYTES32,
          depositDataMerkleProofs,
          {
            from: admin,
          }
        ),
        'PoolValidators: invalid merkle root'
      );
    });

    it('fails to add with invalid merkle proofs', async () => {
      await expectRevert(
        validators.addOperator(operator, depositDataMerkleRoot, '', {
          from: admin,
        }),
        'PoolValidators: invalid merkle proofs'
      );
    });

    it('can update existing operator', async () => {
      await validators.addOperator(
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
        {
          from: admin,
        }
      );

      let depositDataMerkleRoot2 =
        '0x2a6d4eed3ba81bd99efdfd31333e244bb84989cfadbf9ddbf8fabd7296099bc0';

      let receipt = await validators.addOperator(
        operator,
        depositDataMerkleRoot2,
        depositDataMerkleProofs,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OperatorAdded', {
        operator,
        depositDataMerkleRoot: depositDataMerkleRoot2,
        depositDataMerkleProofs,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(depositDataMerkleRoot2);
      expect(_operator[1]).to.equal(false);
    });

    it('can add new operator', async () => {
      let receipt = await validators.addOperator(
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
        {
          from: admin,
        }
      );

      await expectEvent(receipt, 'OperatorAdded', {
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
      });

      let _operator = await validators.getOperator(operator);
      expect(_operator[0]).to.equal(depositDataMerkleRoot);
      expect(_operator[1]).to.equal(false);
    });
  });

  describe('remove operator', () => {
    beforeEach(async () => {
      await validators.addOperator(
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
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
      expect(_operator[1]).to.equal(false);
    });
  });

  describe('commit operator', () => {
    beforeEach(async () => {
      await validators.addOperator(
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
        {
          from: admin,
        }
      );
    });

    it('fails to commit invalid operator', async () => {
      await expectRevert(
        validators.commitOperator({
          from: anyone,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to commit operator twice', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        validators.commitOperator({
          from: operator,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('can commit operator', async () => {
      let receipt = await validators.commitOperator({
        from: operator,
      });

      await expectEvent(receipt, 'OperatorCommitted', {
        operator,
      });
    });
  });

  describe('register validator', () => {
    let {
      publicKey,
      signature,
      withdrawalCredentials,
      merkleProof,
      depositDataRoot,
    } = depositData[0];

    beforeEach(async () => {
      await validators.addOperator(
        operator,
        depositDataMerkleRoot,
        depositDataMerkleProofs,
        {
          from: admin,
        }
      );
    });

    it('fails to register validator by not oracles', async () => {
      await expectRevert(
        validators.registerValidator(
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

    it('fails to register validator for not committed operator', async () => {
      await expectRevert(
        registerValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
          validatorsCount,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to register validator twice', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await registerValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        withdrawalCredentials,
        depositDataRoot,
        oracles,
        oracleAccounts,
        validatorsCount,
      });

      await expectRevert(
        registerValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          withdrawalCredentials,
          depositDataRoot,
          oracles,
          oracleAccounts,
          validatorsCount: keccak256(await depositContract.get_deposit_count()),
        }),
        'PoolValidators: validator already registered'
      );
    });

    it('fails to register for invalid operator', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        registerValidator({
          operator: anyone,
          merkleProof,
          signature,
          publicKey,
          withdrawalCredentials,
          depositDataRoot,
          oracles,
          oracleAccounts,
          validatorsCount,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to register for invalid deposit data', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        registerValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot: constants.ZERO_BYTES32,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
          validatorsCount,
        }),
        'PoolValidators: invalid merkle proof'
      );
    });

    it('fails to register with invalid validators count', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        registerValidator({
          operator,
          merkleProof,
          signature,
          publicKey,
          depositDataRoot,
          oracles,
          oracleAccounts,
          withdrawalCredentials,
          validatorsCount: keccak256('0x6be4000000000000'),
        }),
        'Oracles: invalid validators deposit count'
      );
    });

    it('oracles can register validator', async () => {
      await validators.commitOperator({
        from: operator,
      });

      let poolBalance = await balance.current(pool.address);
      let receipt = await registerValidator({
        operator,
        merkleProof,
        signature,
        publicKey,
        depositDataRoot,
        oracles,
        oracleAccounts,
        withdrawalCredentials,
        validatorsCount,
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'ValidatorRegistered', {
        operator,
        publicKey,
      });
      expect(
        await validators.isValidatorRegistered(
          keccak256(defaultAbiCoder.encode(['bytes'], [publicKey]))
        )
      ).to.equal(true);
      let _operator = await validators.getOperator(operator);
      expect(_operator[1]).to.equal(true);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(validatorDepositAmount)
      );
      await checkValidatorRegistered({
        transaction: receipt.tx,
        pubKey: publicKey,
        withdrawalCredentials,
        signature,
        validatorDepositAmount,
      });
    });
  });
});
