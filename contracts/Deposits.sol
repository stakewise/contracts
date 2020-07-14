// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./interfaces/IAdmins.sol";
import "./interfaces/IDeposits.sol";

/**
 * @title Deposits
 *
 * @dev Contract for keeping track of the deposits from all the collectors. Can only be modified by collectors.
 */
contract Deposits is IDeposits, Initializable {
    using SafeMath for uint256;

    // @dev Mapping between deposit ID (hash of entity ID, sender, recipient) and the amount.
    mapping(bytes32 => uint256) public override amounts;

    // @dev Address of the periodic Pools contract.
    address private periodicPools;

    // @dev Address of the phase 2 Pools contract.
    address private phase2Pools;

    // @dev Address of the Solos contract.
    address private solos;

    // @dev Address of the Groups contract.
    address private groups;

    // @dev Checks whether the caller is the collector contract.
    modifier onlyCollectors() {
        require(
            msg.sender == periodicPools ||
            msg.sender == phase2Pools ||
            msg.sender == groups ||
            msg.sender == solos,
            "Permission denied."
        );
        _;
    }

    /**
     * @dev See {IDeposits-initialize}.
     */
    function initialize(address _periodicPools, address _phase2Pools, address _solos, address _groups) public override initializer {
        periodicPools = _periodicPools;
        phase2Pools = _phase2Pools;
        solos = _solos;
        groups = _groups;
    }

    /**
     * @dev See {IDeposits-getDeposit}.
     */
    function getDeposit(bytes32 _entityId, address _sender, address _recipient) public override view returns (uint256) {
        return amounts[keccak256(abi.encodePacked(_entityId, _sender, _recipient))];
    }

    /**
     * @dev See {IDeposits-addDeposit}.
     */
    function addDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external override onlyCollectors {
        bytes32 depositId = keccak256(abi.encodePacked(_entityId, _sender, _recipient));
        amounts[depositId] = (amounts[depositId]).add(_amount);
        emit DepositAdded(msg.sender, _entityId, _sender, _recipient, _amount);
    }

    /**
     * @dev See {IDeposits-cancelDeposit}.
     */
    function cancelDeposit(bytes32 _entityId, address _sender, address _recipient, uint256 _amount) external override onlyCollectors {
        bytes32 depositId = keccak256(abi.encodePacked(_entityId, _sender, _recipient));
        amounts[depositId] = (amounts[depositId]).sub(_amount);
        emit DepositCanceled(msg.sender, _entityId, _sender, _recipient, _amount);
    }
}
