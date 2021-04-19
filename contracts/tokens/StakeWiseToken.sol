// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "./ERC20PermitUpgradeable.sol";

/**
 * @title StakeWiseToken
 */
contract StakeWiseToken is OwnablePausableUpgradeable, ERC20PermitUpgradeable {
    using SafeMathUpgradeable for uint256;

    mapping (address => uint256) private _balances;

    uint256 private _totalSupply;

    /**
    * @dev Constructor for initializing the StakeWiseToken contract.
    * @param _admin - address of the contract admin.
    */
    function initialize(address _admin) external initializer {
        __OwnablePausableUpgradeable_init(_admin);
        __ERC20_init("StakeWise", "SWISE");
        __ERC20Permit_init("StakeWise");

        uint256 totalMinted = 1_000_000_000 * 1e18;
        _totalSupply = totalMinted;
        _balances[_admin] = totalMinted;
        emit Transfer(address(0), _admin, totalMinted);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {ERC20-_transfer}.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal override whenNotPaused {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount);
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }
}
