const {
  expectRevert,
  expectEvent,
  ether,
  balance,
  send,
  constants,
  BN,
} = require('@openzeppelin/test-helpers');
const { keccak256, defaultAbiCoder } = require('ethers/lib/utils');
const { upgradeContracts } = require('../../deployments');
const { contractSettings } = require('../../deployments/settings');
const {
  registerValidators,
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
const IDepositContract = artifacts.require('IDepositContract');

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
    validatorsDepositRoot;
  let [operator, anyone, ...otherAccounts] = accounts;

  after(async () => stopImpersonatingAccount(admin));

  beforeEach(async () => {
    await impersonateAccount(admin);
    await send.ether(anyone, admin, ether('5'));

    let upgradedContracts = await upgradeContracts();
    pool = await Pool.at(upgradedContracts.pool);
    depositContract = await IDepositContract.at(
      await pool.validatorRegistration()
    );
    validatorDepositAmount = await pool.VALIDATOR_TOTAL_DEPOSIT();
    validatorsDepositRoot = await depositContract.get_deposit_root();

    validators = await PoolValidators.at(upgradedContracts.poolValidators);

    // collect validator deposit
    let poolBalance = await balance.current(pool.address);
    let depositAmount = validatorDeposit.sub(poolBalance.mod(validatorDeposit));
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

  describe('register validators', () => {
    let validatorDepositData = {
      operator,
      withdrawalCredentials: depositData[0].withdrawalCredentials,
      depositDataRoot: depositData[0].depositDataRoot,
      publicKey: depositData[0].publicKey,
      signature: depositData[0].signature,
    };
    let merkleProof = depositData[0].merkleProof;

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
        validators.registerValidator(validatorDepositData, merkleProof, {
          from: anyone,
        }),
        'PoolValidators: access denied'
      );
    });

    it('fails to register validator for not committed operator', async () => {
      await expectRevert(
        registerValidators({
          depositData: [validatorDepositData],
          merkleProofs: [merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to register validator twice', async () => {
      await validators.commitOperator({
        from: operator,
      });

      await expectRevert(
        registerValidators({
          depositData: [validatorDepositData, validatorDepositData],
          merkleProofs: [merkleProof, merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        }),
        'PoolValidators: validator already registered'
      );
    });

    it('fails to register for invalid operator', async () => {
      await validators.commitOperator({
        from: operator,
      });

      await expectRevert(
        registerValidators({
          depositData: [{ ...validatorDepositData, operator: anyone }],
          merkleProofs: [merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        }),
        'PoolValidators: invalid operator'
      );
    });

    it('fails to register for invalid deposit data', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        registerValidators({
          depositData: [
            {
              ...validatorDepositData,
              depositDataRoot: constants.ZERO_BYTES32,
            },
          ],
          merkleProofs: [merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot,
        }),
        'PoolValidators: invalid merkle proof'
      );
    });

    it('fails to register with invalid validators deposit root', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await expectRevert(
        registerValidators({
          depositData: [validatorDepositData],
          merkleProofs: [merkleProof],
          oracles,
          oracleAccounts,
          validatorsDepositRoot: keccak256('0x6be4000000000000'),
        }),
        'Oracles: invalid validators deposit root'
      );
    });

    it('oracles can register one validator', async () => {
      await validators.commitOperator({
        from: operator,
      });

      let poolBalance = await balance.current(pool.address);
      let receipt = await registerValidators({
        depositData: [validatorDepositData],
        merkleProofs: [merkleProof],
        oracles,
        oracleAccounts,
        validatorsDepositRoot,
      });

      await expectEvent.inTransaction(receipt.tx, Pool, 'ValidatorRegistered', {
        operator,
        publicKey: validatorDepositData.publicKey,
      });
      expect(
        await validators.isValidatorRegistered(
          keccak256(
            defaultAbiCoder.encode(['bytes'], [validatorDepositData.publicKey])
          )
        )
      ).to.equal(true);
      let _operator = await validators.getOperator(operator);
      expect(_operator[1]).to.equal(true);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(validatorDepositAmount)
      );
      await checkValidatorRegistered({
        transaction: receipt.tx,
        pubKey: validatorDepositData.publicKey,
        withdrawalCredentials: validatorDepositData.withdrawalCredentials,
        signature: validatorDepositData.signature,
        validatorDepositAmount,
      });
    });

    it('oracles can register multiple validators', async () => {
      await validators.commitOperator({
        from: operator,
      });
      await pool.stake({
        from: anyone,
        value: ether('32').mul(new BN(depositData.length)),
      });

      let poolBalance = await balance.current(pool.address);
      let validatorsDepositData = [];
      let merkleProofs = [];
      for (let i = 0; i < depositData.length; i++) {
        validatorsDepositData.push({
          operator,
          withdrawalCredentials: depositData[i].withdrawalCredentials,
          depositDataRoot: depositData[i].depositDataRoot,
          publicKey: depositData[i].publicKey,
          signature: depositData[i].signature,
        });
        merkleProofs.push(depositData[i].merkleProof);
      }
      let receipt = await registerValidators({
        depositData: validatorsDepositData,
        merkleProofs,
        oracles,
        oracleAccounts,
        validatorsDepositRoot,
      });

      for (let i = 0; i < depositData.length; i++) {
        await expectEvent.inTransaction(
          receipt.tx,
          Pool,
          'ValidatorRegistered',
          {
            operator,
            publicKey: validatorsDepositData[i].publicKey,
          }
        );
        expect(
          await validators.isValidatorRegistered(
            keccak256(
              defaultAbiCoder.encode(
                ['bytes'],
                [validatorsDepositData[i].publicKey]
              )
            )
          )
        ).to.equal(true);
        await checkValidatorRegistered({
          transaction: receipt.tx,
          pubKey: validatorsDepositData[i].publicKey,
          withdrawalCredentials: validatorsDepositData[i].withdrawalCredentials,
          signature: validatorsDepositData[i].signature,
          validatorDepositAmount,
        });
      }

      let _operator = await validators.getOperator(operator);
      expect(_operator[1]).to.equal(true);
      expect(await balance.current(pool.address)).to.bignumber.equal(
        poolBalance.sub(validatorDepositAmount.mul(new BN(depositData.length)))
      );
    });
  });
});
