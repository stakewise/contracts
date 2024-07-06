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

    /**
    * @dev Swaps some of the wrapped tokens to the whitelisted token.
    * Wrapped tokens will be burned.
    * @param _token Address of the whitelisted token contract.
    * @param _amount Amount of tokens to swap.
    * @return Amount of returned tokens.
    */
    function unwrap(address _token, uint256 _amount) external returns (uint256);
}
