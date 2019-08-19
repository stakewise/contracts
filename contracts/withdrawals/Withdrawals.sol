pragma solidity 0.5.10;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Admins.sol";
import "../Deposits.sol";
import "../validators/ValidatorsRegistry.sol";
import "./Wallet.sol";
import "./WalletsManager.sol";

/**
 * @title Withdrawals
 * Withdrawals contract is used by users to withdraw their deposits and rewards.
 * Before users will be able to withdraw, an admin user must unlock the wallet and send a fee to the maintainer.
 * This is done by calling `enableWithdrawals` function.
 */
contract Withdrawals is Initializable {
    using SafeMath for uint256;

    // Tracks whether the user has been withdrawn from the validator.
    mapping(bytes32 => bool) public withdrawnUsers;

    // Tracks the amount left to be withdrawn from the validator's wallet.
    // Required to calculate a reward for every user.
    mapping(bytes32 => uint256) public validatorLeftDeposits;

    // Tracks penalties (if there are such) for validators.
    mapping(bytes32 => uint256) public validatorPenalties;

    // Address of the Admins contract.
    Admins private admins;

    // Address of the Deposits contract.
    Deposits private deposits;

    // Address of the Settings contract.
    Settings private settings;

    // Address of the ValidatorsRegistry contract.
    ValidatorsRegistry private validatorsRegistry;

    // Address of the WalletsManager contract.
    WalletsManager private walletsManager;

    /**
    * Event for indicating whether users can start withdrawing from the wallet.
    * @param wallet - an address of the Wallet contract.
    * @param penalty - shows the penalty (if there is such) received by the validator.
    */
    event WithdrawalsEnabled(
        address indexed wallet,
        uint256 penalty
    );

    /**
    * Event for tracking fees paid to the maintainer.
    * @param maintainer - an address of the maintainer.
    * @param validator - an ID of the validator the fee is paid for.
    * @param amount - fee transferred to the maintainer's address.
    */
    event MaintainerWithdrawn(
        address indexed maintainer,
        bytes32 indexed validator,
        uint256 amount
    );

    /**
    * Event for tracking user withdrawals.
    * @param sender - an address of the deposit sender.
    * @param withdrawer - an address of the deposit withdrawer.
    * @param deposit - an amount deposited.
    * @param reward - a reward generated.
    */
    event UserWithdrawn(
        address indexed sender,
        address indexed withdrawer,
        uint256 deposit,
        uint256 reward
    );

    /**
    * Constructor for initializing the Withdrawals contract.
    * @param _admins - Address of the Admins contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _walletsManager - Address of the Wallets Manager contract.
    */
    function initialize(
        Admins _admins,
        Deposits _deposits,
        Settings _settings,
        ValidatorsRegistry _validatorsRegistry,
        WalletsManager _walletsManager
    )
        public initializer
    {
        admins = _admins;
        deposits = _deposits;
        settings = _settings;
        validatorsRegistry = _validatorsRegistry;
        walletsManager = _walletsManager;
    }

    /**
    * Function for enabling withdrawals.
    * Calculates validator's penalty, sends a fee to the maintainer (if no penalty),
    * unlocks the wallet for withdrawals.
    * Can only be called by users with an admin role.
    * @param _wallet - An address of the wallet to enable withdrawals for.
    */
    function enableWithdrawals(address payable _wallet) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        (, bytes32 validator) = walletsManager.wallets(_wallet);
        require(validator[0] != 0, "Wallet is not assigned to any validator.");

        (uint256 depositAmount, uint256 maintainerFee,) = validatorsRegistry.validators(validator);
        require(_wallet.balance > 0, "Wallet has no ether in it.");

        uint256 penalty;
        if (_wallet.balance < depositAmount) {
            // validator was penalized
            penalty = (_wallet.balance).mul(1 ether).div(depositAmount);
            validatorPenalties[validator] = penalty;
        } else {
            validatorLeftDeposits[validator] = depositAmount;
        }

        walletsManager.unlockWallet(_wallet);
        emit WithdrawalsEnabled(_wallet, penalty);

        // Maintainer gets a fee only in case there is a profit.
        if (_wallet.balance > depositAmount) {
            uint256 totalReward = (_wallet.balance).sub(depositAmount);
            uint256 maintainerReward = (totalReward.mul(maintainerFee)).div(10000);
            // don't send if reward is less than gas required to execute.
            if (maintainerReward > 25 szabo) {
                emit MaintainerWithdrawn(settings.maintainer(), validator, maintainerReward);
                Wallet(_wallet).withdraw(settings.maintainer(), maintainerReward);
            }
        }
    }

    /**
    * Function for withdrawing deposits and rewards to the withdrawer address.
    * If a penalty was applied to the validator, it will transfer only penalized deposit.
    * Otherwise will calculate the user's reward based on the deposit amount.
    * @param _wallet - An address of the wallet to withdraw from (must be unlocked).
    * @param _withdrawer - An address of the account where reward + deposit will be transferred.
      Must be the same as specified during the deposit.
    */
    function withdraw(address payable _wallet, address payable _withdrawer) external {
        (bool unlocked, bytes32 validator) = walletsManager.wallets(_wallet);
        require(unlocked, "Wallet withdrawals are not enabled.");

        bytes32 userId = keccak256(abi.encodePacked(validator, msg.sender, _withdrawer));
        require(!withdrawnUsers[userId], "The withdrawal has already been performed.");

        (, , bytes32 entityId) = validatorsRegistry.validators(validator);
        uint256 userDeposit = deposits.amounts(keccak256(abi.encodePacked(entityId, msg.sender, _withdrawer)));
        require(userDeposit > 0, "User does not have a share in this wallet.");

        uint256 penalty = validatorPenalties[validator];
        uint256 userReward;
        if (penalty > 0) {
            userDeposit = (userDeposit.mul(penalty)).div(1 ether);
        } else {
            uint256 validatorLeftDeposit = validatorLeftDeposits[validator];
            // XXX: optimize for the case of reward size smaller than gas required to execute.
            uint256 totalReward = (_wallet.balance).sub(validatorLeftDeposit);
            userReward = totalReward.mul(userDeposit).div(validatorLeftDeposit);
            validatorLeftDeposits[validator] = validatorLeftDeposit.sub(userDeposit);
        }

        withdrawnUsers[userId] = true;
        emit UserWithdrawn(msg.sender, _withdrawer, userDeposit, userReward);

        Wallet(_wallet).withdraw(_withdrawer, userDeposit.add(userReward));
    }
}
