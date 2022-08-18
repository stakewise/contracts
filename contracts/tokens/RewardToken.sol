// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedToken.sol";
import "../interfaces/IRewardToken.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IOracles.sol";
import "../interfaces/IFeesEscrow.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title RewardToken
 *
 * @dev RewardToken contract stores pool reward tokens.
 * If deploying contract for the first time, the `initialize` function should replace the `upgrade` function.
 */
contract RewardToken is IRewardToken, OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for uint256;

    // @dev Address of the StakedToken contract.
    IStakedToken private stakedToken;

    // @dev Address of the Oracles contract.
    address private oracles;

    // @dev Maps account address to its reward checkpoint.
    mapping(address => Checkpoint) public override checkpoints;

    // @dev Address where protocol fee will be paid.
    address public override protocolFeeRecipient;

    // @dev Protocol percentage fee.
    uint256 public override protocolFee;

    // @dev Total amount of rewards.
    uint128 public override totalRewards;

    // @dev Reward per token for user reward calculation.
    uint128 public override rewardPerToken;

    // @dev Last rewards update block number by oracles.
    uint256 public override lastUpdateBlockNumber;

    // @dev Address of the MerkleDistributor contract.
    address public override merkleDistributor;

    // @dev Maps account address to whether rewards are distributed through the merkle distributor.
    mapping(address => bool) public override rewardsDisabled;

    // @dev Address of the FeesEscrow contract.
    address private feesEscrow;

    /**
     * @dev See {IRewardToken-initialize}.
     */
    function initialize(
        address admin,
        address _stakedToken,
        address _oracles,
        address _protocolFeeRecipient,
        uint256 _protocolFee,
        address _merkleDistributor
    )
        external override initializer
    {
        require(admin != address(0), "RewardToken: invalid admin address");
        require(_stakedToken != address(0), "RewardToken: invalid StakedToken address");
        require(_oracles != address(0), "RewardToken: invalid Oracles address");
        require(_protocolFee < 1e4, "RewardToken: invalid protocol fee");
        require(_merkleDistributor != address(0), "RewardToken: invalid MerkleDistributor address");

        __OwnablePausableUpgradeable_init(admin);
        __ERC20_init("StakeWise Reward GNO", "rGNO");
        __ERC20Permit_init("StakeWise Reward GNO");

        stakedToken = IStakedToken(_stakedToken);
        oracles = _oracles;
        merkleDistributor = _merkleDistributor;

        protocolFeeRecipient = _protocolFeeRecipient;
        emit ProtocolFeeRecipientUpdated(_protocolFeeRecipient);

        protocolFee = _protocolFee;
        emit ProtocolFeeUpdated(_protocolFee);
    }

    function upgrade(address _feesEscrow) external override onlyAdmin whenPaused {
        require(feesEscrow == address(0), "Pool: FeesEscrow address already set");

        feesEscrow = _feesEscrow;
    }

    /**
     * @dev See {IRewardToken-setRewardsDisabled}.
     */
    function setRewardsDisabled(address account, bool isDisabled) external override {
        require(msg.sender == address(stakedToken), "RewardToken: access denied");
        require(rewardsDisabled[account] != isDisabled, "RewardToken: value did not change");

        uint128 _rewardPerToken = rewardPerToken;
        checkpoints[account] = Checkpoint({
            reward: _balanceOf(account, _rewardPerToken).toUint128(),
            rewardPerToken: _rewardPerToken
        });

        rewardsDisabled[account] = isDisabled;
        emit RewardsToggled(account, isDisabled);
    }

    /**
     * @dev See {IRewardToken-setProtocolFeeRecipient}.
     */
    function setProtocolFeeRecipient(address recipient) external override onlyAdmin {
        // can be address(0) to distribute fee through the Merkle Distributor
        protocolFeeRecipient = recipient;
        emit ProtocolFeeRecipientUpdated(recipient);
    }

    /**
     * @dev See {IRewardToken-setProtocolFee}.
     */
    function setProtocolFee(uint256 _protocolFee) external override onlyAdmin {
        require(_protocolFee < 1e4, "RewardToken: invalid protocol fee");
        protocolFee = _protocolFee;
        emit ProtocolFeeUpdated(_protocolFee);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return totalRewards;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return _balanceOf(account, rewardPerToken);
    }

    function _balanceOf(address account, uint256 _rewardPerToken) internal view returns (uint256) {
        Checkpoint memory cp = checkpoints[account];

        // skip calculating period reward when it has not changed or when the rewards are disabled
        if (_rewardPerToken == cp.rewardPerToken || rewardsDisabled[account]) return cp.reward;

        uint256 stakedAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedAmount = stakedToken.distributorPrincipal();
        } else {
            stakedAmount = stakedToken.balanceOf(account);
        }
        if (stakedAmount == 0) return cp.reward;

        // return checkpoint reward + current reward
        return _calculateNewReward(cp.reward, stakedAmount, _rewardPerToken.sub(cp.rewardPerToken));
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardToken: invalid sender");
        require(recipient != address(0), "RewardToken: invalid receiver");
        require(block.number > lastUpdateBlockNumber, "RewardToken: cannot transfer during rewards update");

        uint128 _rewardPerToken = rewardPerToken; // gas savings
        checkpoints[sender] = Checkpoint({
            reward: _balanceOf(sender, _rewardPerToken).sub(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        checkpoints[recipient] = Checkpoint({
            reward: _balanceOf(recipient, _rewardPerToken).add(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });

        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev See {IRewardToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) external override returns (bool accRewardsDisabled) {
        accRewardsDisabled = rewardsDisabled[account];
        if (!accRewardsDisabled) _updateRewardCheckpoint(account, rewardPerToken);
    }

    function _updateRewardCheckpoint(address account, uint128 newRewardPerToken) internal {
        Checkpoint memory cp = checkpoints[account];
        if (newRewardPerToken == cp.rewardPerToken) return;

        uint256 stakedAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedAmount = stakedToken.distributorPrincipal();
        } else {
            stakedAmount = stakedToken.balanceOf(account);
        }
        if (stakedAmount == 0) {
            checkpoints[account] = Checkpoint({
                reward: cp.reward,
                rewardPerToken: newRewardPerToken
            });
        } else {
            uint256 periodRewardPerToken = uint256(newRewardPerToken).sub(cp.rewardPerToken);
            checkpoints[account] = Checkpoint({
                reward: _calculateNewReward(cp.reward, stakedAmount, periodRewardPerToken).toUint128(),
                rewardPerToken: newRewardPerToken
            });
        }
    }

    function _calculateNewReward(
        uint256 currentReward,
        uint256 stakedAmount,
        uint256 periodRewardPerToken
    )
        internal pure returns (uint256)
    {
        return currentReward.add(stakedAmount.mul(periodRewardPerToken).div(1e18));
    }

    /**
     * @dev See {IRewardToken-updateRewardCheckpoints}.
     */
    function updateRewardCheckpoints(address account1, address account2) external override returns (bool rewardsDisabled1, bool rewardsDisabled2) {
        rewardsDisabled1 = rewardsDisabled[account1];
        rewardsDisabled2 = rewardsDisabled[account2];
        if (!rewardsDisabled1 || !rewardsDisabled2) {
            uint128 newRewardPerToken = rewardPerToken;
            if (!rewardsDisabled1) _updateRewardCheckpoint(account1, newRewardPerToken);
            if (!rewardsDisabled2) _updateRewardCheckpoint(account2, newRewardPerToken);
        }
    }

    /**
     * @dev See {IRewardToken-updateTotalRewards}.
     */
    function updateTotalRewards(uint256 newTotalRewards) external override {
        require(msg.sender == oracles, "RewardToken: access denied");

        uint256 feesAmount = IFeesEscrow(feesEscrow).transferToPool();
        uint256 periodRewards = newTotalRewards.sub(totalRewards).add(feesAmount);
        if (periodRewards == 0) {
            lastUpdateBlockNumber = block.number;
            emit RewardsUpdated(0, newTotalRewards, rewardPerToken, 0, 0);
            return;
        }

        // calculate protocol reward and new reward per token amount
        uint256 protocolReward = periodRewards.mul(protocolFee).div(1e4);
        uint256 prevRewardPerToken = rewardPerToken;
        uint256 newRewardPerToken = prevRewardPerToken.add(periodRewards.sub(protocolReward).mul(1e18).div(stakedToken.totalDeposits()));
        uint128 newRewardPerToken128 = newRewardPerToken.toUint128();

        // store previous distributor rewards for period reward calculation
        uint256 prevDistributorBalance = _balanceOf(address(0), prevRewardPerToken);

        // update total rewards and new reward per token
        (totalRewards, rewardPerToken) = (newTotalRewards.toUint128(), newRewardPerToken128);

        uint256 newDistributorBalance = _balanceOf(address(0), newRewardPerToken);
        address _protocolFeeRecipient = protocolFeeRecipient;
        if (_protocolFeeRecipient == address(0) && protocolReward > 0) {
            // add protocol reward to the merkle distributor
            newDistributorBalance = newDistributorBalance.add(protocolReward);
        } else if (protocolReward > 0) {
            // update fee recipient's checkpoint and add its period reward
            checkpoints[_protocolFeeRecipient] = Checkpoint({
                reward: _balanceOf(_protocolFeeRecipient, newRewardPerToken).add(protocolReward).toUint128(),
                rewardPerToken: newRewardPerToken128
            });
        }

        // update distributor's checkpoint
        if (newDistributorBalance != prevDistributorBalance) {
            checkpoints[address(0)] = Checkpoint({
                reward: newDistributorBalance.toUint128(),
                rewardPerToken: newRewardPerToken128
            });
        }

        lastUpdateBlockNumber = block.number;
        emit RewardsUpdated(
            periodRewards,
            newTotalRewards,
            newRewardPerToken,
            newDistributorBalance.sub(prevDistributorBalance),
            _protocolFeeRecipient == address(0) ? protocolReward: 0
        );
    }

    /**
     * @dev See {IRewardToken-claim}.
     */
    function claim(address account, uint256 amount) external override {
        require(msg.sender == merkleDistributor, "RewardToken: access denied");
        require(account != address(0), "RewardToken: invalid account");

        // update checkpoints, transfer amount from distributor to account
        uint128 _rewardPerToken = rewardPerToken;
        checkpoints[address(0)] = Checkpoint({
            reward: _balanceOf(address(0), _rewardPerToken).sub(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        checkpoints[account] = Checkpoint({
            reward: _balanceOf(account, _rewardPerToken).add(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        emit Transfer(address(0), account, amount);
    }
}
