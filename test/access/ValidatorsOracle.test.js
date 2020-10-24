const { expect } = require('chai');
const {
  constants,
  expectEvent,
  expectRevert,
  ether,
  BN,
} = require('@openzeppelin/test-helpers');
const {
  deployAndInitializeAdmins,
  deployAndInitializeOperators,
  deployValidatorsOracle,
  initializeValidatorsOracle,
} = require('../../deployments/access');
const { deployAndInitializeSettings } = require('../../deployments/settings');
const {
  deploySWRToken,
  deploySWDToken,
  initializeSWRToken,
  initializeSWDToken,
} = require('../../deployments/tokens');

const Admins = artifacts.require('Admins');
const SWRToken = artifacts.require('SWRToken');
const SWDToken = artifacts.require('SWDToken');
const Settings = artifacts.require('Settings');
const ValidatorsOracle = artifacts.require('ValidatorsOracle');

contract('ValidatorsOracle', ([_, ...accounts]) => {
  let admins, settings, validatorsOracle, swrToken, swdToken;
  let [
    admin,
    voter,
    anotherVoter,
    poolContractAddress,
    anyone,
    ...otherAccounts
  ] = accounts;

  before(async () => {
    admins = await Admins.at(await deployAndInitializeAdmins(admin));
    let operatorsContractAddress = await deployAndInitializeOperators(
      admins.address
    );
    settings = await Settings.at(
      await deployAndInitializeSettings(
        admins.address,
        operatorsContractAddress
      )
    );
  });

  beforeEach(async () => {
    const swdTokenContractAddress = await deploySWDToken();
    const swrTokenContractAddress = await deploySWRToken();
    const validatorsOracleContractAddress = await deployValidatorsOracle();
    await initializeSWDToken(
      swdTokenContractAddress,
      swrTokenContractAddress,
      settings.address,
      poolContractAddress
    );
    await initializeSWRToken(
      swrTokenContractAddress,
      swdTokenContractAddress,
      settings.address,
      validatorsOracleContractAddress
    );

    await initializeValidatorsOracle(
      validatorsOracleContractAddress,
      admins.address,
      settings.address,
      swrTokenContractAddress
    );

    validatorsOracle = await ValidatorsOracle.at(
      validatorsOracleContractAddress
    );
    swrToken = await SWRToken.at(swrTokenContractAddress);
    swdToken = await SWDToken.at(swdTokenContractAddress);
  });

  describe('assigning', () => {
    it('admin can assign voter role to another account', async () => {
      const receipt = await validatorsOracle.addVoter(voter, { from: admin });
      expectEvent(receipt, 'VoterAdded', {
        account: voter,
      });
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      expect(await validatorsOracle.isVoter(admin)).equal(false);
      expect(await validatorsOracle.isVoter(anyone)).equal(false);
    });

    it('zero address cannot be assigned', async () => {
      await expectRevert(
        validatorsOracle.addVoter(constants.ZERO_ADDRESS, { from: admin }),
        'Roles: account is the zero address'
      );
    });

    it('same account cannot be assigned voter role multiple times', async () => {
      await validatorsOracle.addVoter(voter, { from: admin });
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      await expectRevert(
        validatorsOracle.addVoter(voter, { from: admin }),
        'Roles: account already has role'
      );
    });

    it('others cannot assign voter role to an account', async () => {
      await expectRevert(
        validatorsOracle.addVoter(voter, { from: anyone }),
        'ValidatorsOracle: only admin users can assign voters'
      );
      expect(await validatorsOracle.isVoter(voter)).equal(false);
      expect(await validatorsOracle.isVoter(anyone)).equal(false);
    });

    it('voters cannot assign voter role to others', async () => {
      await validatorsOracle.addVoter(voter, { from: admin });
      await expectRevert(
        validatorsOracle.addVoter(anotherVoter, { from: voter }),
        'ValidatorsOracle: only admin users can assign voters'
      );
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      expect(await validatorsOracle.isVoter(anotherVoter)).equal(false);
    });
  });

  describe('removing', () => {
    beforeEach(async () => {
      await validatorsOracle.addVoter(voter, { from: admin });
      await validatorsOracle.addVoter(anotherVoter, { from: admin });
    });

    it('anyone cannot remove voters', async () => {
      await expectRevert(
        validatorsOracle.removeVoter(voter, { from: anyone }),
        'ValidatorsOracle: only admin users can remove voters'
      );
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      expect(await validatorsOracle.isVoter(anotherVoter)).equal(true);
    });

    it('voter cannot remove other voters', async () => {
      await expectRevert(
        validatorsOracle.removeVoter(anotherVoter, { from: voter }),
        'ValidatorsOracle: only admin users can remove voters'
      );
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      expect(await validatorsOracle.isVoter(anotherVoter)).equal(true);
    });

    it('cannot remove account without voter role', async () => {
      await expectRevert(
        validatorsOracle.removeVoter(anyone, { from: admin }),
        'Roles: account does not have role'
      );
      expect(await validatorsOracle.isVoter(voter)).equal(true);
      expect(await validatorsOracle.isVoter(anotherVoter)).equal(true);
    });

    it('admins can remove voters', async () => {
      const receipt = await validatorsOracle.removeVoter(voter, {
        from: admin,
      });
      expectEvent(receipt, 'VoterRemoved', {
        account: voter,
      });
      expect(await validatorsOracle.isVoter(voter)).equal(false);
      expect(await validatorsOracle.isVoter(anotherVoter)).equal(true);
    });
  });

  describe('total rewards voting', () => {
    let [voter1, voter2, voter3] = otherAccounts;

    beforeEach(async () => {
      await validatorsOracle.addVoter(voter1, { from: admin });
      await validatorsOracle.addVoter(voter2, { from: admin });
      await validatorsOracle.addVoter(voter3, { from: admin });

      await swdToken.mint(anyone, ether('32'), { from: poolContractAddress });
    });

    it('fails to vote when contract is paused', async () => {
      await settings.setPausedContracts(validatorsOracle.address, true, {
        from: admin,
      });
      expect(await settings.pausedContracts(validatorsOracle.address)).equal(
        true
      );

      await expectRevert(
        validatorsOracle.voteForTotalRewards(ether('1'), {
          from: voter1,
        }),
        'ValidatorsOracle: contract is paused'
      );
      expect(await swrToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('only voter can submit new total rewards', async () => {
      await expectRevert(
        validatorsOracle.voteForTotalRewards(ether('1'), {
          from: anyone,
        }),
        'ValidatorsOracle: permission denied'
      );
      expect(await swrToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('cannot vote for the same total rewards twice', async () => {
      await validatorsOracle.voteForTotalRewards(ether('1'), {
        from: voter1,
      });
      await expectRevert(
        validatorsOracle.voteForTotalRewards(ether('1'), {
          from: voter1,
        }),
        'ValidatorsOracle: vote was already submitted'
      );
      expect(await swrToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('does not submit rewards when not enough votes', async () => {
      const receipt = await validatorsOracle.voteForTotalRewards(ether('1'), {
        from: voter1,
      });
      expectEvent(receipt, 'VoteSubmitted', {
        voter: voter1,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });
      expect(await swrToken.totalRewards()).to.bignumber.equal(new BN(0));
    });

    it('submits total rewards when enough votes collected', async () => {
      // voter 1 submits
      let receipt = await validatorsOracle.voteForTotalRewards(ether('1'), {
        from: voter1,
      });
      expectEvent(receipt, 'VoteSubmitted', {
        voter: voter1,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });

      // voter 2 submits
      receipt = await validatorsOracle.voteForTotalRewards(ether('1'), {
        from: voter2,
      });
      expectEvent(receipt, 'VoteSubmitted', {
        voter: voter2,
        newTotalRewards: ether('1'),
        updateTimestamp: new BN(0),
      });
      expect(await swrToken.totalRewards()).to.bignumber.equal(ether('1'));
    });
  });
});
