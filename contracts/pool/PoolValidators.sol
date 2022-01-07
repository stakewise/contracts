// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../presets/OwnablePausableUpgradeable.sol";
import "../interfaces/IPoolValidators.sol";
import "../interfaces/IPool.sol";

/**
 * @title PoolValidators
 *
 * @dev PoolValidators contract keeps track of the pool validators' deposit data and onboards new operators.
 */
contract PoolValidators is IPoolValidators, OwnablePausableUpgradeable, ReentrancyGuardUpgradeable {
    using AddressUpgradeable for address payable;
    using SafeMathUpgradeable for uint256;

    // Maps hash of the validator public key to whether it is registered.
    mapping(bytes32 => bool) public override isValidatorRegistered;

    // Maps operator address to its data.
    mapping(address => Operator) private operators;

    // @dev Address of the Pool contract.
    IPool private pool;

    // @dev Address of the Oracles contract.
    address private oracles;

    /**
     * @dev See {IPoolValidators-initialize}.
     */
    function initialize(address _admin, address _pool, address _oracles) external override initializer {
        require(_admin != address(0), "Pool: invalid admin address");
        require(_pool != address(0), "Pool: invalid Pool address");
        require(_oracles != address(0), "Pool: invalid Oracles address");

        __OwnablePausableUpgradeable_init(_admin);
        pool = IPool(_pool);
        oracles = _oracles;
    }

    /**
     * @dev See {IPoolValidators-getOperator}.
     */
    function getOperator(address _operator) external view override returns (bytes32, bool) {
        Operator storage operator = operators[_operator];
        return (
            operator.depositDataMerkleRoot,
            operator.committed
        );
    }

    /**
     * @dev See {IPoolValidators-addOperator}.
     */
    function addOperator(
        address _operator,
        bytes32 depositDataMerkleRoot,
        string calldata depositDataMerkleProofs
    )
        external override onlyAdmin whenNotPaused
    {
        require(_operator != address(0), "PoolValidators: invalid operator");
        // merkle root and proofs must be validated off chain prior submitting the transaction
        require(depositDataMerkleRoot != "", "PoolValidators: invalid merkle root");
        require(bytes(depositDataMerkleProofs).length != 0, "PoolValidators: invalid merkle proofs");

        // load operator
        Operator storage operator = operators[_operator];
        require(operator.depositDataMerkleRoot != depositDataMerkleRoot, "PoolValidators: same merkle root");

        // update operator
        operator.depositDataMerkleRoot = depositDataMerkleRoot;
        operator.committed = false;

        emit OperatorAdded(
            _operator,
            depositDataMerkleRoot,
            depositDataMerkleProofs
        );
    }

    /**
     * @dev See {IPoolValidators-commitOperator}.
     */
    function commitOperator() external override whenNotPaused {
        // mark operator as committed
        Operator storage operator = operators[msg.sender];
        require(operator.depositDataMerkleRoot != "" && !operator.committed, "PoolValidators: invalid operator");
        operator.committed = true;

        emit OperatorCommitted(msg.sender);
    }

    /**
     * @dev See {IPoolValidators-removeOperator}.
     */
    function removeOperator(address _operator) external override whenNotPaused {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == _operator, "PoolValidators: access denied");

        Operator storage operator = operators[_operator];
        require(operator.depositDataMerkleRoot != "", "PoolValidators: invalid operator");

        // clean up operator
        delete operators[_operator];

        emit OperatorRemoved(msg.sender, _operator);
    }

    /**
     * @dev See {IPoolValidators-registerValidator}.
     */
    function registerValidator(DepositData calldata depositData, bytes32[] calldata merkleProof) external override {
        require(msg.sender == oracles, "PoolValidators: access denied");

        // mark validator as registered -> prevents from registering the same validator twice
        bytes32 validatorId = keccak256(abi.encode(depositData.publicKey));
        require(!isValidatorRegistered[validatorId], "PoolValidators: validator already registered");
        isValidatorRegistered[validatorId] = true;

        // fetch deposit data merkle root
        Operator storage operator = operators[depositData.operator];
        bytes32 depositDataMerkleRoot = operator.depositDataMerkleRoot;
        require(depositDataMerkleRoot != "" && operator.committed, "PoolValidators: invalid operator");

        // check whether provided deposit data was previously approved
        bytes32 node = keccak256(abi.encode(
            depositData.publicKey,
            depositData.withdrawalCredentials,
            depositData.signature,
            depositData.depositDataRoot
        ));
        require(
            MerkleProofUpgradeable.verify(merkleProof, depositDataMerkleRoot, node),
            "PoolValidators: invalid merkle proof"
        );

        // register validator
        pool.registerValidator(depositData);
    }
}
