// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

/**
 * @dev Interface of the GNO token contract.
 */
interface IGNOToken {
    /**
    * @dev Allows to spend holder's unlimited amount by the specified spender.
    * The function can be called by anyone, but requires having allowance parameters
    * signed by the holder according to EIP712.
    * @param _holder - The holder's address.
    * @param _spender - The spender's address.
    * @param _nonce - The nonce taken from `nonces(_holder)` public getter.
    * @param _expiry - The allowance expiration date (unix timestamp in UTC). Can be zero for no expiration. Forced to zero if `_allowed` is `false`.
    * @param _allowed - True to enable unlimited allowance for the spender by the holder. False to disable.
    * @param _v - A final byte of signature (ECDSA component).
    * @param _r - The first 32 bytes of signature (ECDSA component).
    * @param _s - The second 32 bytes of signature (ECDSA component).
    */
    function permit(
        address _holder,
        address _spender,
        uint256 _nonce,
        uint256 _expiry,
        bool _allowed,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external;

    /**
    * @dev Transfers tokens to the contract and calls `onTokenTransfer`.
    * @param _to - address of the token contract.
    * @param _value - amount of tokens to transfer.
    * @param _data - encoded data to pass for the call.
    * @return `true` if call has succeeded.
    */
    function transferAndCall(address _to, uint256 _value, bytes calldata _data) external returns (bool);
}
