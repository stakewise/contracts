pragma solidity 0.5.15;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/WalletsManagers.sol";
import "../Deposits.sol";
import "../validators/ValidatorsRegistry.sol";
import "./Wallet.sol";
import "./WalletsRegistry.sol";

/**
 * @title Withdrawals
 * Withdrawals contract is used by users to withdraw their deposits and rewards.
 * Before users will be able to withdraw, a user with wallets manager role must unlock the wallet and
 * send a fee to the maintainer. This is done by calling `enableWithdrawals` function.
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

    // Address of the WalletsManagers contract.
    WalletsManagers private walletsManagers;

    // Address of the Deposits contract.
    Deposits private deposits;

    // Address of the Settings contract.
    Settings private settings;

    // Address of the ValidatorsRegistry contract.
    ValidatorsRegistry private validatorsRegistry;

    // Address of the WalletsRegistry contract.
    WalletsRegistry private walletsRegistry;

    /**
    * Event for tracking fees paid to the maintainer.
    * @param maintainer - an address of the maintainer.
    * @param wallet - an address of the wallet the fee was payed from.
    * @param amount - fee transferred to the maintainer's address.
    */
    event MaintainerWithdrawn(
        address maintainer,
        address wallet,
        uint256 amount
    );

    /**
    * Event for tracking user withdrawals.
    * @param sender - an address of the deposit sender.
    * @param withdrawer - an address of the deposit withdrawer.
    * @param wallet - an address of the wallet contract.
    * @param deposit - an amount deposited.
    * @param reward - a reward generated.
    */
    event UserWithdrawn(
        address sender,
        address withdrawer,
        address wallet,
        uint256 deposit,
        uint256 reward
    );

    /**
    * Constructor for initializing the Withdrawals contract.
    * @param _walletsManagers - Address of the WalletsManagers contract.
    * @param _deposits - Address of the Deposits contract.
    * @param _settings - Address of the Settings contract.
    * @param _validatorsRegistry - Address of the Validators Registry contract.
    * @param _walletsRegistry - Address of the Wallets Registry contract.
    */
    function initialize(
        WalletsManagers _walletsManagers,
        Deposits _deposits,
        Settings _settings,
        ValidatorsRegistry _validatorsRegistry,
        WalletsRegistry _walletsRegistry
    )
        public initializer
    {
        walletsManagers = _walletsManagers;
        deposits = _deposits;
        settings = _settings;
        validatorsRegistry = _validatorsRegistry;
        walletsRegistry = _walletsRegistry;
    }

    /**
    * Function for enabling withdrawals.
    * Calculates validator's penalty, sends a fee to the maintainer (if no penalty),
    * unlocks the wallet for withdrawals.
    * Can only be called by users with a wallets manager role.
    * @param _wallet - An address of the wallet to enable withdrawals for.
    */
    function enableWithdrawals(address payable _wallet) external {
        (, bytes32 validator) = walletsRegistry.wallets(_wallet);
        require(validator[0] != 0, "Wallet is not assigned to any validator.");

        (uint256 depositAmount, uint256 maintainerFee,) = validatorsRegistry.validators(validator);
        require(_wallet.balance > 0, "Wallet has no ether in it.");

        require(walletsManagers.isManager(msg.sender), "Permission denied.");

        uint256 penalty;
        if (_wallet.balance < depositAmount) {
            // validator was penalized
            penalty = (_wallet.balance).mul(1 ether).div(depositAmount);
            validatorPenalties[validator] = penalty;
        } else {
            validatorLeftDeposits[validator] = depositAmount;
        }

        walletsRegistry.unlockWallet(_wallet);

        // Maintainer gets a fee only in case there is a profit.
        if (_wallet.balance > depositAmount) {
            uint256 totalReward = (_wallet.balance).sub(depositAmount);
            uint256 maintainerReward = (totalReward.mul(maintainerFee)).div(10000);
            // don't send if reward is less than gas required to execute.
            if (maintainerReward > 25 szabo) {
                emit MaintainerWithdrawn(settings.maintainer(), _wallet, maintainerReward);
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
        (bool unlocked, bytes32 validator) = walletsRegistry.wallets(_wallet);
        require(unlocked, "Wallet withdrawals are not enabled.");

        bytes32 userId = keccak256(abi.encodePacked(validator, msg.sender, _withdrawer));
        require(!withdrawnUsers[userId], "The withdrawal has already been performed.");

        (, , bytes32 collectorEntityId) = validatorsRegistry.validators(validator);
        uint256 userDeposit = deposits.amounts(keccak256(abi.encodePacked(collectorEntityId, msg.sender, _withdrawer)));
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
        emit UserWithdrawn(msg.sender, _withdrawer, _wallet, userDeposit, userReward);

        Wallet(_wallet).withdraw(_withdrawer, userDeposit.add(userReward));
    }
}
