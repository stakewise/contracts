// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedEthToken.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPoolValidators.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, OwnablePausableUpgradeable {
    // @dev Address of the PoolEscrow contract.
    address public immutable override poolEscrow;

    // @dev Total activated validators.
    uint256 private activatedValidators;

    // @dev Pool validator withdrawal credentials.
    bytes32 private withdrawalCredentials;

    // @dev Address of the ETH2 Deposit Contract (deployed by Ethereum).
    IDepositContract private validatorRegistration;

    // @dev Address of the StakedEthToken contract.
    IStakedEthToken private stakedEthToken;

    // @dev Address of the PoolValidators contract.
    IPoolValidators private validators;

    // @dev Address of the Oracles contract.
    address private oracles;

    // @dev Maps senders to the validator index that it will be activated in.
    mapping(address => mapping(uint256 => uint256)) private activations;

    // @dev Total pending validators.
    uint256 private pendingValidators;

    // @dev Amount of deposited ETH that is not considered for the activation period.
    uint256 private minActivatingDeposit;

    // @dev Pending validators percent limit. If it's not exceeded tokens can be minted immediately.
    uint256 private pendingValidatorsLimit;

   /**
   * @dev Constructor
   * @dev Since the immutable variable value is stored in the bytecode,
   *      its value would be shared among all proxies pointing to a given contract instead of each proxy’s storage.
   * @param _poolEscrow Address of the PoolEscrow contract.
   */
    constructor(address _poolEscrow) {
        poolEscrow = _poolEscrow;
    }

    /**
     * @dev See {IPool-transferToPoolEscrow}.
     */
    function transferToPoolEscrow() external override {
        uint256 balance = address(this).balance;
        // solhint-disable-next-line avoid-low-level-calls
        (bool success,) = payable(poolEscrow).call{value: balance}("");
        require(success, "Pool: transfer failed");
    }

    /**
     * @dev See {IPool-receiveFees}.
     */
    function receiveFees() external payable override {}
}
