// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IStakedToken.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IPoolValidators.sol";
import "../interfaces/IMGNOWrapper.sol";

/**
 * @title Pool
 *
 * @dev Pool contract accumulates deposits from the users, mints tokens and registers validators.
 */
contract Pool is IPool, OwnablePausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // @dev Address of the GNO <-> mGNO wrapper.
    address public constant override MGNO_WRAPPER = 0x647507A70Ff598F386CB96ae5046486389368C66;

    // @dev Address of the GNO token.
    address public constant override GNO_TOKEN = 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb;

    // @dev Address of the mGNO token.
    address public constant override MGNO_TOKEN = 0x722fc4DAABFEaff81b97894fC623f91814a1BF68;

    // @dev Address of the PoolEscrow contract.
    address public immutable override poolEscrow;

    // @dev Total activated validators.
    uint256 private activatedValidators;

    // @dev Pool validator withdrawal credentials.
    bytes32 private withdrawalCredentials;

    // @dev Address of the GBC Deposit Contract.
    IDepositContract private validatorRegistration;

    // @dev Address of the StakedToken contract.
    IStakedToken private stakedToken;

    // @dev Address of the PoolValidators contract.
    IPoolValidators private validators;

    // @dev Address of the Oracles contract.
    address private oracles;

    // @dev Maps senders to the validator index that it will be activated in.
    mapping(address => mapping(uint256 => uint256)) private activations;

    // @dev Total pending validators.
    uint256 private pendingValidators;

    // @dev Amount of deposited mGNO that is not considered for the activation period.
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
        // fetch balances
        uint256 mGnoBalance = IERC20Upgradeable(MGNO_TOKEN).balanceOf(address(this));
        if (mGnoBalance > 0) {
            // convert mGNO to GNO
            IMGNOWrapper(MGNO_WRAPPER).unwrap(GNO_TOKEN, mGnoBalance);
        }
        uint256 gnoBalance = IERC20Upgradeable(GNO_TOKEN).balanceOf(address(this));
        if (gnoBalance > 0) {
            // transfer GNO to the PoolEscrow
            IERC20Upgradeable(GNO_TOKEN).safeTransfer(poolEscrow, gnoBalance);
        }
    }
}
