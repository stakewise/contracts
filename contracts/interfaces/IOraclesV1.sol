// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

pragma abicoder v2;

/**
 * @dev Interface of the Oracles V1 contract.
 */
interface IOraclesV1 {
    /**
    * @dev Function for retrieving current rewards nonce.
    */
    function currentNonce() external view returns (uint256);
}
