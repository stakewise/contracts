// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/IManagers.sol";
import "../interfaces/IDeposits.sol";
import "../interfaces/ISettings.sol";
import "../interfaces/IValidators.sol";
import "../interfaces/IValidatorTransfers.sol";
import "../interfaces/IWallet.sol";

/**
 * @title Withdrawals
 *
 * @dev Withdrawals contract is used by users to withdraw their deposits and rewards.
 * Before users will be able to withdraw, a user with the manager role must unlock the wallet and
 * send a fee to the maintainer. This is done by calling `unlockWallet` function.
 */
contract Withdrawals is Initializable {
    using SafeMath for uint256;

    // @dev Tracks whether the user has withdrawn its funds.
    mapping(bytes32 => bool) public withdrawnUsers;

    // @dev Tracks the amount left to be withdrawn from the validator's wallet.
    // required to calculate a reward for every user.
    mapping(bytes32 => uint256) public validatorLeftDeposits;

    // @dev Tracks penalties (if there are such) for validators.
    mapping(bytes32 => uint256) public validatorPenalties;

    // @dev Tracks unlocked wallets.
    mapping(address => bool) private unlockedWallets;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Deposits contract.
    IDeposits private deposits;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Validators contract.
    IValidators private validators;

    // @dev Address of the Validator Transfers contract.
    IValidatorTransfers private validatorTransfers;

    /**
    * @dev Event for tracking fees paid to the maintainer.
    * @param maintainer - address of the maintainer.
    * @param entityId - ID of the entity, the maintainer withdrawn from.
    * @param amount - fee transferred to the maintainer address.
    */
    event MaintainerWithdrawn(
        address maintainer,
        bytes32 entityId,
        uint256 amount
    );

    /**
    * @dev Event for tracking user withdrawals.
    * @param sender - address of the deposit sender.
    * @param recipient - address of the deposit recipient.
    * @param entityId - ID of the entity, the user withdrawn from.
    * @param depositAmount - amount deposited.
    * @param rewardAmount - reward generated.
    */
    event UserWithdrawn(
        address sender,
        address recipient,
        bytes32 entityId,
        uint256 depositAmount,
        uint256 rewardAmount
    );

    /**
    * @dev Event for tracking wallet unlocks.
    * @param wallet - address of the unlocked wallet.
    */
    event WalletUnlocked(address wallet);

    /**
    * @dev Constructor for initializing the Withdrawals contract.
    * @param _managers - address of the Managers contract.
    * @param _deposits - address of the Deposits contract.
    * @param _settings - address of the Settings contract.
    * @param _validators - address of the Validators contract.
    * @param _validatorTransfers - address of the Validator Transfers contract.
    */
    function initialize(
        IManagers _managers,
        IDeposits _deposits,
        ISettings _settings,
        IValidators _validators,
        IValidatorTransfers _validatorTransfers
    )
        public initializer
    {
        managers = _managers;
        deposits = _deposits;
        settings = _settings;
        validators = _validators;
        validatorTransfers = _validatorTransfers;
    }

    /**
    * @dev Function for unlocking wallet for withdrawals.
    * Calculates validator's penalty, sends a fee to the maintainer (if no penalty),
    * resolves debts of the validator to previous entities, unlocks the wallet for withdrawals.
    * Can only be called by users with a manager role.
    * @param _validatorId - ID of the validator (hash of the public key).
    */
    function unlockWallet(bytes32 _validatorId) external {
        (uint256 depositAmount, uint256 maintainerFee, bytes32 entityId, address wallet) = validators.validators(_validatorId);
        require(wallet != address(0), "Validator must have a wallet assigned.");
        require(managers.canManageWallet(entityId, msg.sender), "Permission denied.");
        require(!unlockedWallets[wallet], "Wallet is already unlocked.");

        (uint256 userDebt, uint256 maintainerDebt,) = validatorTransfers.validatorDebts(_validatorId);
        uint256 entityBalance = (payable(wallet).balance).sub(userDebt).sub(maintainerDebt);
        require(entityBalance > 0, "Wallet has not enough ether in it.");

        uint256 penalty;
        if (entityBalance < depositAmount) {
            // validator was penalised
            penalty = entityBalance.mul(1 ether).div(depositAmount);
            validatorPenalties[_validatorId] = penalty;
        } else {
            validatorLeftDeposits[_validatorId] = depositAmount;
        }

        // maintainer gets a fee for the entity only in case there is a profit.
        uint256 maintainerReward;
        if (maintainerFee > 0 && entityBalance > depositAmount) {
            maintainerReward = ((entityBalance.sub(depositAmount)).mul(maintainerFee)).div(10000);
        }

        // unlock wallet for withdrawals
        unlockedWallets[wallet] = true;
        emit WalletUnlocked(wallet);

        // transfer debts to previous validator owners
        if (userDebt > 0) {
            validatorTransfers.resolveDebt(_validatorId);
            IWallet(wallet).withdraw(payable(address(validatorTransfers)), userDebt);
        }

        // transfer maintainer fee
        if (maintainerReward.add(maintainerDebt) > 0) {
            address payable maintainer = settings.maintainer();
            emit MaintainerWithdrawn(maintainer, entityId, maintainerReward);
            IWallet(wallet).withdraw(maintainer, maintainerReward.add(maintainerDebt));
        }
    }

    /**
    * @dev Function for withdrawing deposits and rewards to the recipient address.
    * If a penalty was applied to the validator, it will transfer only penalized deposit.
    * Otherwise will calculate the user's reward based on the deposit amount.
    * @param _validatorId - ID of the validator (hash of the public key).
    */
    function withdraw(bytes32 _validatorId, address payable _recipient) external {
        (, , bytes32 entityId, address wallet) = validators.validators(_validatorId);
        require(unlockedWallets[wallet], "Wallet is not unlocked yet.");

        bytes32 userId = keccak256(abi.encodePacked(entityId, msg.sender, _recipient));
        require(!withdrawnUsers[userId], "The withdrawal has already been performed.");

        uint256 userDeposit = deposits.amounts(userId);
        require(userDeposit > 0, "User does not have a share in validator.");

        uint256 penalty = validatorPenalties[_validatorId];
        uint256 userReward;
        if (penalty > 0) {
            userDeposit = (userDeposit.mul(penalty)).div(1 ether);
        } else {
            uint256 validatorLeftDeposit = validatorLeftDeposits[_validatorId];
            // XXX: optimize for the case of reward size smaller than gas required to execute.
            uint256 totalReward = (payable(wallet).balance).sub(validatorLeftDeposit);
            userReward = totalReward.mul(userDeposit).div(validatorLeftDeposit);
            validatorLeftDeposits[_validatorId] = validatorLeftDeposit.sub(userDeposit);
        }

        withdrawnUsers[userId] = true;
        emit UserWithdrawn(msg.sender, _recipient, entityId, userDeposit, userReward);

        IWallet(wallet).withdraw(_recipient, userDeposit.add(userReward));
    }
}
