// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../tokens/BaseERC20.sol";


contract ERC20Mock is BaseERC20 {
    using SafeMath for uint256;

    uint256 private _totalSupply;

    address private owner;
    mapping (address => uint256) private _balances;

    function initialize(address _owner, uint256 initialBalance, string memory name, string memory symbol) public initializer {
        super.initialize(name, symbol);
        owner = _owner;
        _mint(_owner, initialBalance);
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function mint(address account, uint256 amount) public {
        require(msg.sender == owner, "Permission denied.");
        _mint(account, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }
}
