// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "../interfaces/IFeesEscrow.sol";
import "../interfaces/IBalancer.sol";
import "../interfaces/IWrapper.sol";

/**
 * @title FeesEscrow
 *
 * @dev FeesEscrow contract is used to receive tips from validators and move them to the Pool contract
 * when calling transferToPool method.
 */
contract FeesEscrow is IFeesEscrow, IBalancerStruct {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // @dev Pool contract's address.
    address private pool;

    // @dev RewardToken contract's address.
    address private rewardToken;

    // @dev Balancer pool id for Symmetric Vault.
    bytes32 private symmetricPoolId;

    // @dev Symmetric Balancer Vault contract address.
    IBalancerVault private symmetricVault;

    // @dev Native xDAI wrapper contract address.
    address private wrapper;

    // @dev GNO token contract address.
    address private gnoToken;

    constructor(
        address _pool,
        address _rewardToken,
        bytes32 _symmetricPoolId,
        IBalancerVault _symmetricVault,
        address _wrapper,
        address _gnoToken
    ) {
        pool = _pool;
        rewardToken = _rewardToken;
        symmetricPoolId = _symmetricPoolId;
        symmetricVault = _symmetricVault;
        wrapper = _wrapper;
        gnoToken = _gnoToken;
    }

    /**
     * @dev See {IFeesEscrow-transferToPool}.
     */
    function transferToPool() external override returns (uint256) {
        require(msg.sender == rewardToken, "FeesEscrow: invalid caller");

        // Wrap all accumulated native xDAI tokens to WXDAI
        uint256 balance = address(this).balance;

        if (balance == 0) {
            return 0;
        }

        IWrapper(wrapper).deposit{value: balance}();

        // Prepare data to exchange WXDAI to GNO tokens via Balancer Vault
        bytes memory userData = new bytes(0);
        FundManagement memory funds = FundManagement(address(this), false, address(this), false);
        SingleSwap memory singleSwap = SingleSwap(
            symmetricPoolId,
            SwapKind.GIVEN_IN,
            wrapper,
            gnoToken,
            balance,
            userData
        );

        // It's very important to approve WXDAI from FeesEscrow to Balancer Vault's without infinity approve
        IERC20Upgradeable(wrapper).safeApprove(address(symmetricVault), balance);

        // Now we are ready to exchange WXDAI token to GNO
        uint amountGnoOut = symmetricVault.swap(singleSwap, funds, 0, type(uint).max);

        // Transferring obtained GNO amount after exchanging to Pool contract address
        IERC20Upgradeable(gnoToken).safeTransfer(pool, amountGnoOut);

        emit FeesTransferred(balance, amountGnoOut);

        return amountGnoOut;
    }

    receive() external payable {}
}
