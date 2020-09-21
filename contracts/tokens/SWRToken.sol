// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/SafeCast.sol";
import "../interfaces/ISWDToken.sol";
import "../interfaces/ISWRToken.sol";
import "../interfaces/ISettings.sol";
import "./BaseERC20.sol";

/**
 * @title SWRToken
 *
 * @dev SWRToken contract stores pool reward tokens.
 */
contract SWRToken is ISWRToken, BaseERC20 {
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;

    /**
    * @dev Structure for storing information about user reward checkpoint.
    * @param rewardRate - user reward rate checkpoint.
    * @param reward - user reward checkpoint.
    */
    struct Checkpoint {
        int256 rewardRate;
        int256 reward;
    }

    // @dev Last rewards update timestamp by validators oracle.
    uint256 public override updateTimestamp;

    // @dev Total amount of rewards. Can be negative in case of penalties.
    int256 public override totalRewards;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) private checkpoints;

    // @dev Address of the SWDToken contract.
    ISWDToken private swdToken;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the ValidatorsOracle contract.
    address private validatorsOracle;

    // @dev Reward rate for user reward calculation. Can be negative in case of the penalties.
    int256 private rewardRate;

    /**
      * @dev See {ISWRToken-initialize}.
      */
    function initialize(address _swdToken, address _settings, address _validatorsOracle) public override initializer {
        super.initialize("StakeWise Reward Token", "SWR");
        swdToken = ISWDToken(_swdToken);
        settings = ISettings(_settings);
        validatorsOracle = _validatorsOracle;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return totalRewards > 0 ? totalRewards.toUint256() : 0;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view override returns (uint256) {
        int256 balance = rewardOf(account);
        return balance > 0 ? balance.toUint256() : 0;
    }

    /**
      * @dev See {ISWRToken-rewardOf}.
      */
    function rewardOf(address account) public view override returns (int256) {
        Checkpoint memory cp = checkpoints[account];

        int256 curReward;
        uint256 deposit = swdToken.depositOf(account);
        if (deposit != 0) {
            // calculate current reward of the account
            curReward = deposit.toInt256().mul(rewardRate.sub(cp.rewardRate)).div(1 ether);
        }

        // return checkpoint reward + current reward
        return cp.reward.add(curReward);
    }

    /**
     * @dev See {BaseERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override {
        require(sender != address(0), "SWRToken: transfer from the zero address");
        require(recipient != address(0), "SWRToken: transfer to the zero address");
        require(!settings.pausedContracts(address(this)), "SWRToken: contract is disabled");

        uint256 senderReward = balanceOf(sender);
        require(amount > 0 && senderReward >= amount, "SWRToken: invalid amount");
        checkpoints[sender] = Checkpoint(rewardRate, senderReward.sub(amount).toInt256());

        checkpoints[recipient] = Checkpoint(rewardRate, rewardOf(recipient).add(amount.toInt256()));

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {ISWRToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override {
        require(msg.sender == address(swdToken), "SWRToken: permission denied");
        checkpoints[account] = Checkpoint(rewardRate, rewardOf(account));
    }

    /**
     * @dev See {ISWRToken-updateTotalRewards}.
     */
    function updateTotalRewards(int256 newTotalRewards) external override {
        require(msg.sender == validatorsOracle, "SWRToken: permission denied");
        require(!settings.pausedContracts(address(this)), "SWRToken: contract is disabled");

        // calculate reward rate used for account reward calculation
        int256 periodRewards = newTotalRewards.sub(totalRewards);
        rewardRate = rewardRate.add(periodRewards.mul(1 ether).div(swdToken.totalDeposits().toInt256()));

        // solhint-disable-next-line not-rely-on-time
        updateTimestamp = block.timestamp;
        totalRewards = newTotalRewards;

        emit RewardsUpdated(periodRewards, newTotalRewards, rewardRate, updateTimestamp);
    }
}
