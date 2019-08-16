pragma solidity 0.5.10;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../access/Admins.sol";
import "../Deposits.sol";
import "../validators/ValidatorsRegistry.sol";
import "./Wallet.sol";
import "./WalletsManager.sol";

contract Withdrawals is Initializable {
    using SafeMath for uint256;

    mapping(bytes32 => bool) public withdrawnUsers;
    mapping(bytes32 => uint256) public validatorPenalties;

    Admins private admins;
    Deposits private deposits;
    Settings private settings;
    ValidatorsRegistry private validatorsRegistry;
    WalletsManager private walletsManager;

    event WithdrawalsEnabled(
        address indexed wallet,
        uint256 penalty
    );

    event MaintainerWithdrawn(
        address indexed maintainer,
        bytes32 indexed validator,
        uint256 amount
    );

    event UserWithdrawn(
        address indexed sender,
        address indexed withdrawer,
        uint256 deposit,
        uint256 reward
    );

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

    function enableWithdrawals(address payable _wallet) external {
        require(admins.isAdmin(msg.sender), "Permission denied.");

        (, bytes32 validator) = walletsManager.wallets(_wallet);
        require(validator[0] != 0, "Wallet is not assigned to any validator.");

        (uint256 depositAmount, uint256 maintainerFee,) = validatorsRegistry.validators(validator);
        require(_wallet.balance > 0, "Wallet has no ether in it.");

        uint256 penalty;
        if (_wallet.balance < depositAmount) {
            // validator was penalized
            // calculate penalty with 4 decimals precision
            penalty = (_wallet.balance).mul(1 ether).div(depositAmount);
            validatorPenalties[validator] = penalty;
        }

        walletsManager.unlockWallet(_wallet);
        emit WithdrawalsEnabled(_wallet, penalty);

        // Maintainer gets a fee only in case there is a profit.
        if (_wallet.balance > depositAmount) {
            uint256 totalReward = _wallet.balance.sub(depositAmount);
            uint256 maintainerReward = (totalReward.mul(maintainerFee)).div(10000);
            if (maintainerReward > 0) {
                emit MaintainerWithdrawn(settings.maintainer(), validator, maintainerReward);
                Wallet(_wallet).withdraw(settings.maintainer(), maintainerReward);
            }
        }
    }

    function withdraw(address payable _wallet, address payable _withdrawer) external {
        (bool unlocked, bytes32 validator) = walletsManager.wallets(_wallet);
        require(unlocked, "Wallet withdrawals are not enabled.");
        require(validator[0] != 0, "Wallet is not assigned to any validator.");

        bytes32 userId = keccak256(abi.encodePacked(validator, msg.sender, _withdrawer));
        require(!withdrawnUsers[userId], "The withdrawal has already been performed.");

        (uint256 validatorDeposit, , bytes32 entityId) = validatorsRegistry.validators(validator);
        uint256 userDeposit = deposits.amounts(keccak256(abi.encodePacked(entityId, msg.sender, _withdrawer)));
        require(userDeposit > 0, "User does not have a share in this wallet.");

        uint256 penalty = validatorPenalties[validator];
        uint256 userReward;
        if (penalty > 0) {
            userDeposit = (userDeposit.mul(penalty)).div(1 ether);
        } else {
            uint256 totalReward = (_wallet.balance).sub(validatorDeposit);
            userReward = totalReward.mul(userDeposit).div(validatorDeposit);
        }

        withdrawnUsers[userId] = true;
        emit UserWithdrawn(msg.sender, _withdrawer, userDeposit, userReward);

        Wallet(_wallet).withdraw(_withdrawer, userDeposit.add(userReward));
    }
}
