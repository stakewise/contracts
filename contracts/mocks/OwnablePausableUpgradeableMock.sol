// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "../presets/OwnablePausableUpgradeable.sol";

contract OwnablePausableUpgradeableMock is OwnablePausableUpgradeable {
    function initialize(address _admin) public initializer {
        __OwnablePausableUpgradeable_init(_admin);
    }
}
