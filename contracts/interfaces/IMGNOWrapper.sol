// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the mGNO token wrapper contract.
 */
interface IMGNOWrapper {
    /**
    * @dev Returns token conversion rate.
    * @param token - address of the token.
    */
    function tokenRate(address token) external view returns (uint256);
}
