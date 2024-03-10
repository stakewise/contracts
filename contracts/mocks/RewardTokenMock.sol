// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "../tokens/RewardToken.sol";

/**
 * @title RewardTokenMock
 *
 * @dev RewardTokenMock contract is used for testing the RewardToken contract.
 */
contract RewardTokenMock is RewardToken {
    constructor(address _vault) RewardToken(_vault) {}

    /**
     * @dev Initializes the contract.
     *
     * @param _name Name of the token.
     * @param _symbol Symbol of the token.
     * @param _admin Address of the admin.
     * @param _merkleDistributor Address of the MerkleDistributor contract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _admin,
        address _merkleDistributor
    ) external initializer {
        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __OwnablePausableUpgradeable_init(_admin);
        merkleDistributor = _merkleDistributor;
    }
}
