// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title ContractChecker
 *
 * @dev ContractChecker can be used to check whether the address is a contract.
 */
contract ContractChecker {
    /**
    * @dev Returns true if `account` is a contract.
    */
    function isContract(address account) external view returns (bool) {
        return Address.isContract(account);
    }
}
