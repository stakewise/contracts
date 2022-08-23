// SPDX-License-Identifier: GPL-3.0-or-later
// https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol

pragma solidity 0.7.5;

interface IWrapper {
    function deposit() external payable;
    function withdraw(uint amount) external;
}
