// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IRewardEthToken.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IFeesEscrow.sol";
import "../interfaces/IEthGenesisVault.sol";
import "../interfaces/IPool.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title RewardEthToken
 *
 * @dev RewardEthToken contract stores pool reward tokens.
 * If deploying contract for the first time, the `initialize` function should replace the `upgrade` function.
 */
contract RewardEthToken is IRewardEthToken, OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for uint256;

    // @dev Address of the Vault contract.
    address public immutable override vault;

    // @dev Address of the Pool contract.
    IPool private immutable pool;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

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
    IFeesEscrow private feesEscrow;

    // @dev Total amount of penalties received.
    uint256 public override totalPenalty;

   /**
   * @dev Constructor
   * @dev Since the immutable variable value is stored in the bytecode,
   *      its value would be shared among all proxies pointing to a given contract instead of each proxy’s storage.
   * @param _vault Address of the StakeWise V3 vault.
   * @param _pool Address of the StakeWise V2 pool.
   */
    constructor(address _vault, address _pool) {
        vault = _vault;
        pool = IPool(_pool);
    }

    /**
     * @dev See {IRewardEthToken-setRewardsDisabled}.
     */
    function setRewardsDisabled(address account, bool isDisabled) external override {
        require(msg.sender == address(stakedEthToken), "RewardEthToken: access denied");
        require(rewardsDisabled[account] != isDisabled, "RewardEthToken: value did not change");

        uint128 _rewardPerToken = rewardPerToken;
        checkpoints[account] = Checkpoint({
            reward: _balanceOf(account, _rewardPerToken).toUint128(),
            rewardPerToken: _rewardPerToken
        });

        rewardsDisabled[account] = isDisabled;
        emit RewardsToggled(account, isDisabled);
    }

    /**
     * @dev See {IRewardEthToken-setProtocolFeeRecipient}.
     */
    function setProtocolFeeRecipient(address recipient) external override onlyAdmin {
        // can be address(0) to distribute fee through the Merkle Distributor
        protocolFeeRecipient = recipient;
        emit ProtocolFeeRecipientUpdated(recipient);
    }

    /**
     * @dev See {IRewardEthToken-setProtocolFee}.
     */
    function setProtocolFee(uint256 _protocolFee) external override onlyAdmin {
        require(_protocolFee < 1e4, "RewardEthToken: invalid protocol fee");
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
     * @dev See {IRewardEthToken-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return uint256(totalRewards).add(stakedEthToken.totalSupply());
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

        uint256 stakedEthAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedEthAmount = stakedEthToken.distributorPrincipal();
        } else {
            stakedEthAmount = stakedEthToken.balanceOf(account);
        }
        if (stakedEthAmount == 0) return cp.reward;

        // return checkpoint reward + current reward
        return _calculateNewReward(cp.reward, stakedEthAmount, _rewardPerToken.sub(cp.rewardPerToken));
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "RewardEthToken: invalid sender");
        require(recipient != address(0), "RewardEthToken: invalid receiver");
        require(block.number > lastUpdateBlockNumber, "RewardEthToken: cannot transfer during rewards update");

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
     * @dev See {IRewardEthToken-updateRewardCheckpoint}.
     */
    function updateRewardCheckpoint(address account) public override returns (bool accRewardsDisabled) {
        accRewardsDisabled = rewardsDisabled[account];
        if (!accRewardsDisabled) _updateRewardCheckpoint(account, rewardPerToken);
    }

    function _updateRewardCheckpoint(address account, uint128 newRewardPerToken) internal {
        Checkpoint memory cp = checkpoints[account];
        if (newRewardPerToken == cp.rewardPerToken) return;

        uint256 stakedEthAmount;
        if (account == address(0)) {
            // fetch merkle distributor current principal
            stakedEthAmount = stakedEthToken.distributorPrincipal();
        } else {
            stakedEthAmount = stakedEthToken.balanceOf(account);
        }
        if (stakedEthAmount == 0) {
            checkpoints[account] = Checkpoint({
                reward: cp.reward,
                rewardPerToken: newRewardPerToken
            });
        } else {
            uint256 periodRewardPerToken = uint256(newRewardPerToken).sub(cp.rewardPerToken);
            checkpoints[account] = Checkpoint({
                reward: _calculateNewReward(cp.reward, stakedEthAmount, periodRewardPerToken).toUint128(),
                rewardPerToken: newRewardPerToken
            });
        }
    }

    function _calculateNewReward(
        uint256 currentReward,
        uint256 stakedEthAmount,
        uint256 periodRewardPerToken
    )
        internal pure returns (uint256)
    {
        return currentReward.add(stakedEthAmount.mul(periodRewardPerToken).div(1e18));
    }

    /**
     * @dev See {IRewardEthToken-updateRewardCheckpoints}.
     */
    function updateRewardCheckpoints(address account1, address account2) public override returns (bool rewardsDisabled1, bool rewardsDisabled2) {
        rewardsDisabled1 = rewardsDisabled[account1];
        rewardsDisabled2 = rewardsDisabled[account2];
        if (!rewardsDisabled1 || !rewardsDisabled2) {
            uint128 newRewardPerToken = rewardPerToken;
            if (!rewardsDisabled1) _updateRewardCheckpoint(account1, newRewardPerToken);
            if (!rewardsDisabled2) _updateRewardCheckpoint(account2, newRewardPerToken);
        }
    }

    /**
     * @dev See {IRewardEthToken-updateTotalRewards}.
     */
    function updateTotalRewards(int256 rewardsDelta) external override {
        require(msg.sender == address(vault), "RewardEthToken: access denied");

        uint256 periodRewards;
        if (rewardsDelta > 0) {
            periodRewards = uint256(rewardsDelta);
            uint256 _totalPenalty = totalPenalty; // gas savings
            if (periodRewards <= _totalPenalty) {
                totalPenalty = _totalPenalty.sub(periodRewards);
                periodRewards = 0;
            } else if (_totalPenalty > 0) {
                periodRewards = periodRewards.sub(_totalPenalty);
                totalPenalty = 0;
            }
        } else if (rewardsDelta < 0) {
            uint256 _totalPenalty = totalPenalty; // gas savings
            _totalPenalty = _totalPenalty.add(uint256(-rewardsDelta));
            require(_totalPenalty <= totalAssets(), "RewardEthToken: invalid penalty amount");
            totalPenalty = _totalPenalty;
        }

        if (periodRewards == 0) {
            lastUpdateBlockNumber = block.number;
            emit RewardsUpdated(0, totalRewards, rewardPerToken, 0, 0);
            return;
        }

        // calculate protocol reward and new reward per token amount
        uint256 newTotalRewards = uint256(totalRewards).add(periodRewards);
        uint256 protocolReward = periodRewards.mul(protocolFee).div(1e4);
        uint256 prevRewardPerToken = rewardPerToken;
        uint256 newRewardPerToken = prevRewardPerToken.add(periodRewards.sub(protocolReward).mul(1e18).div(stakedEthToken.totalDeposits()));
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

        // transfer accumulated fees
        if (address(feesEscrow).balance > 0) {
            feesEscrow.transferToPool();
            pool.transferToPoolEscrow();
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

    function _burn(uint256 amount) private {
        uint128 _rewardPerToken = rewardPerToken; // gas savings
        checkpoints[msg.sender] = Checkpoint({
            reward: _balanceOf(msg.sender, _rewardPerToken).sub(amount).toUint128(),
            rewardPerToken: _rewardPerToken
        });
        totalRewards = uint256(totalRewards).sub(amount).toUint128();
        emit Transfer(msg.sender, address(0), amount);
    }

    /**
    * @dev See {IRewardEthToken-migrate}.
     */
    function migrate(address receiver, uint256 principal, uint256 reward) external override {
        require(receiver != address(0), "RewardEthToken: invalid receiver");
        require(block.number > lastUpdateBlockNumber, "RewardEthToken: cannot migrate during rewards update");

        // calculate amount of assets to migrate
        uint256 assets = principal.add(reward);

        uint256 _totalPenalty = totalPenalty; // gas savings
        if (_totalPenalty > 0) {
            uint256 _totalAssets = totalAssets(); // gas savings
            // apply penalty to assets
            uint256 assetsAfterPenalty = assets.mul(_totalAssets.sub(_totalPenalty)).div(_totalAssets);
            totalPenalty = _totalPenalty.add(assetsAfterPenalty).sub(assets);
            assets = assetsAfterPenalty;
        }
        require(assets > 0, "RewardEthToken: zero assets");

        // burn rewards and principal
        if (reward > 0) _burn(reward);
        if (principal > 0) stakedEthToken.burn(msg.sender, principal);

        IEthGenesisVault(vault).migrate(receiver, assets);
    }

    /**
     * @dev See {IRewardEthToken-claim}.
     */
    function claim(address account, uint256 amount) external override {
        require(msg.sender == merkleDistributor, "RewardEthToken: access denied");
        require(account != address(0), "RewardEthToken: invalid account");

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
