// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IFeesEscrow.sol";
import "../interfaces/IBalancer.sol";
import "../interfaces/IWrapper.sol";
import "../interfaces/IGNOToken.sol";

/**
 * @title FeesEscrow
 *
 * @dev FeesEscrow contract is used to receive tips from validators and transfer
 * them to the Pool contract via calling transferToPool method from the RewardToken contract.
 */
contract FeesEscrow is IFeesEscrow {
    using SafeERC20 for IERC20;

    // @dev Pool contract's address.
    address private immutable pool;

    // @dev RewardToken contract's address.
    address private immutable rewardToken;

    // @dev Balancer pool id for Symmetric Vault.
    bytes32 private immutable symmetricPoolId;

    // @dev Symmetric Balancer Vault contract address.
    IBalancerVault private immutable symmetricVault;

    // @dev Native xDAI wrapper contract address.
    IWrapper private immutable wrapper;

    // @dev GNO to mGNO wrapper contract address.
    address private immutable mGnoWrapper;

    // @dev GNO token contract address.
    address private immutable gnoToken;

    // @dev mGNO token contract address.
    IERC20 private immutable mGnoToken;

    constructor(
        address _pool,
        address _rewardToken,
        bytes32 _symmetricPoolId,
        IBalancerVault _symmetricVault,
        IWrapper _wrapper,
        address _mGnoWrapper,
        address _gnoToken,
        IERC20 _mGnoToken
    ) {
        pool = _pool;
        rewardToken = _rewardToken;
        symmetricPoolId = _symmetricPoolId;
        symmetricVault = _symmetricVault;
        wrapper = _wrapper;
        mGnoWrapper = _mGnoWrapper;
        gnoToken = _gnoToken;
        mGnoToken = _mGnoToken;
    }

    /**
     * @dev See {IFeesEscrow-transferToPool}.
     */
    function transferToPool() external override returns (uint256) {
        require(msg.sender == rewardToken, "FeesEscrow: invalid caller");

        // Fetch current native xDAI balance to be wrapped next
        uint256 balance = address(this).balance;

        if (balance == 0) {
            return 0;
        }

        // Wrap all accumulated native xDAI tokens to WXDAI
        wrapper.deposit{value: balance}();

        // Prepare data to exchange WXDAI to GNO tokens via Balancer Vault
        IBalancerVault.SingleSwap memory singleSwap = IBalancerVault.SingleSwap(
            symmetricPoolId,
            IBalancerVault.SwapKind.GIVEN_IN,
            address(wrapper),
            gnoToken,
            balance,
            new bytes(0)
        );

        // It's very important to approve WXDAI from FeesEscrow to Balancer Vault's without infinity approve
        IERC20(address(wrapper)).safeApprove(address(symmetricVault), balance);

        // Now we are ready to exchange WXDAI token to GNO
        IBalancerVault.FundManagement memory funds = IBalancerVault.FundManagement(
            address(this),
            false,
            address(this),
            false
        );
        uint amountGnoOut = symmetricVault.swap(singleSwap, funds, 0, type(uint).max);

        // Convert GNO tokens to mGNO
        IERC20(gnoToken).safeApprove(mGnoWrapper, amountGnoOut);
        bool success = IGNOToken(gnoToken).transferAndCall(mGnoWrapper, amountGnoOut, "");
        require(success, "FeesEscrow: failed to convert tokens");

        uint mGnoBalance = mGnoToken.balanceOf(address(this));

        // Transferring obtained mGNO amount to Pool contract
        mGnoToken.safeTransfer(pool, mGnoBalance);

        emit FeesTransferred(amountGnoOut);

        return amountGnoOut;
    }

    /**
     * @dev Allows FeesEscrow contract to receive MEV rewards and priority fees.
     * Later these rewards will be converted to mGNO and transferred to Pool contract by
     * `FeesEscrow.transferToPool` method which is called once a day by the `RewardToken` contract.
     */
    receive() external payable {}
}
