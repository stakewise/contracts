// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";


contract ERC20MockUpgradeSafe is ERC20UpgradeSafe {
    address private owner;

    constructor(
        string memory name,
        string memory symbol,
        address _owner,
        uint256 initialBalance
    ) public payable {
        __ERC20Mock_init(name, symbol, _owner, initialBalance);
    }

    function __ERC20Mock_init(
        string memory name,
        string memory symbol,
        address _owner,
        uint256 initialBalance
    ) internal initializer {
        __Context_init_unchained();
        __ERC20_init_unchained(name, symbol);
        __ERC20Mock_init_unchained(_owner, initialBalance);
    }

    function __ERC20Mock_init_unchained(address _owner, uint256 initialBalance) internal initializer {
        owner = _owner;
        _mint(_owner, initialBalance);
    }

    function mint(address account, uint256 amount) public {
        require(msg.sender == owner, "Permission denied.");
        _mint(account, amount);
    }

    uint256[50] private __gap;
}
