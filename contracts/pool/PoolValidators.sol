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
contract PoolValidators is IPoolValidators, OwnablePausableUpgradeable, ReentrancyGuardUpgradeable  {
    using AddressUpgradeable for address payable;
    using SafeMathUpgradeable for uint256;

    // Maps hash of the validator public key to its registration status.
    mapping(bytes32 => ValidatorStatus) public override validatorStatuses;

    // Maps operator address to its collateral deposit.
    mapping(address => uint256) public override collaterals;

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
        __OwnablePausableUpgradeable_init(_admin);
        pool = IPool(_pool);
        oracles = _oracles;
    }

    /**
     * @dev See {IPoolValidators-getOperator}.
     */
    function getOperator(address _operator) external view override returns (bytes32, bytes32, bool) {
        Operator storage operator = operators[_operator];
        return (
            operator.initializeMerkleRoot,
            operator.finalizeMerkleRoot,
            operator.locked
        );
    }

    /**
     * @dev See {IPoolValidators-addOperator}.
     */
    function addOperator(
        address _operator,
        bytes32 initializeMerkleRoot,
        string memory initializeMerkleProofs,
        bytes32 finalizeMerkleRoot,
        string memory finalizeMerkleProofs
    )
        external override onlyAdmin whenNotPaused
    {
        require(_operator != address(0), "PoolValidators: invalid operator");
        require(
            initializeMerkleRoot != "" && finalizeMerkleRoot != "" && finalizeMerkleRoot != initializeMerkleRoot,
            "PoolValidators: invalid merkle roots"
        );
        require(
            bytes(initializeMerkleProofs).length != 0 && bytes(finalizeMerkleProofs).length != 0 &&
            keccak256(bytes(initializeMerkleProofs)) != keccak256(bytes(finalizeMerkleProofs)),
            "PoolValidators: invalid merkle proofs"
        );

        // load operator
        Operator storage operator = operators[_operator];
        require(!operator.locked, "PoolValidators: operator locked");

        // update operator
        operator.initializeMerkleRoot = initializeMerkleRoot;
        operator.finalizeMerkleRoot = finalizeMerkleRoot;

        emit OperatorAdded(
            _operator,
            initializeMerkleRoot,
            initializeMerkleProofs,
            finalizeMerkleRoot,
            finalizeMerkleProofs
        );
    }

    /**
     * @dev See {IPoolValidators-depositCollateral}.
     */
    function depositCollateral(address _operator) external payable override whenNotPaused {
        require(_operator != address(0), "PoolValidators: invalid operator");
        require(collaterals[_operator] == 0, "PoolValidators: collateral exists");
        require(msg.value == pool.VALIDATOR_INIT_DEPOSIT(), "PoolValidators: invalid collateral");

        // update collateral
        collaterals[_operator] = msg.value;

        emit CollateralDeposited(_operator, msg.value);
    }

    /**
     * @dev See {IPoolValidators-withdrawCollateral}.
     */
    function withdrawCollateral(address payable collateralRecipient) external override nonReentrant whenNotPaused {
        require(collateralRecipient != address(0), "PoolValidators: invalid collateral recipient");

        // load operator
        Operator storage operator = operators[msg.sender];
        require(operator.initializeMerkleRoot == "", "PoolValidators: operator exists");

        uint256 collateral = collaterals[msg.sender];
        require(collateral > 0, "PoolValidators: collateral does not exist");

        // remove collateral
        delete collaterals[msg.sender];

        // withdraw amount
        collateralRecipient.sendValue(collateral);

        emit CollateralWithdrawn(msg.sender, collateralRecipient, collateral);
    }

    /**
     * @dev See {IPoolValidators-removeOperator}.
     */
    function removeOperator(address _operator) external override whenNotPaused {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == _operator, "PoolValidators: access denied");

        Operator storage operator = operators[_operator];
        require(operator.initializeMerkleRoot != "", "PoolValidators: invalid operator");
        require(!operator.locked, "PoolValidators: operator is locked");

        // clean up operator
        delete operators[_operator];

        emit OperatorRemoved(msg.sender, _operator);
    }

    /**
     * @dev See {IPoolValidators-slashOperator}.
     */
    function slashOperator(DepositData memory depositData, bytes32[] memory merkleProof) external override onlyAdmin whenNotPaused {
        // fetch operator
        Operator storage operator = operators[depositData.operator];
        bytes32 initializeMerkleRoot = operator.initializeMerkleRoot;
        require(initializeMerkleRoot != "" && operator.locked, "PoolValidators: invalid operator");

        // check whether provided deposit data was previously approved
        bytes32 node = keccak256(abi.encode(
            depositData.publicKey,
            depositData.withdrawalCredentials,
            depositData.signature,
            depositData.depositDataRoot
        ));
        require(
            MerkleProofUpgradeable.verify(merkleProof, initializeMerkleRoot, node),
            "PoolValidators: invalid merkle proof"
        );

        uint256 refundAmount = pool.VALIDATOR_INIT_DEPOSIT();
        uint256 operatorCollateral = collaterals[depositData.operator];
        require(operatorCollateral >= refundAmount, "PoolValidators: insufficient collateral");

        // mark validator as slashed
        bytes32 validatorId = keccak256(abi.encode(depositData.publicKey));
        require(
            validatorStatuses[validatorId] == ValidatorStatus.Initialized,
            "PoolValidators: invalid validator status"
        );
        validatorStatuses[validatorId] = ValidatorStatus.Failed;

        // remove operator to prevent further validator assignments
        delete operators[depositData.operator];

        // reduce operator's collateral
        collaterals[depositData.operator] = operatorCollateral.sub(refundAmount);

        // refund to pool
        pool.refund{value : refundAmount}();
        emit OperatorSlashed(depositData.operator, depositData.publicKey, refundAmount);
    }

    /**
     * @dev See {IPoolValidators-initializeValidator}.
     */
    function initializeValidator(DepositData memory depositData, bytes32[] memory merkleProof) external override whenNotPaused {
        require(msg.sender == oracles, "PoolValidators: access denied");

        // mark validator as initialized -> prevents from initializing the same validator twice
        bytes32 validatorId = keccak256(abi.encode(depositData.publicKey));
        require(
            validatorStatuses[validatorId] == ValidatorStatus.Uninitialized,
            "PoolValidators: invalid validator status"
        );
        validatorStatuses[validatorId] = ValidatorStatus.Initialized;

        // fetch operator
        Operator storage operator = operators[depositData.operator];
        (bytes32 initializeMerkleRoot, bool locked) = (operator.initializeMerkleRoot, operator.locked);
        require(initializeMerkleRoot != "", "PoolValidators: invalid operator");
        require(
            collaterals[depositData.operator] >= pool.VALIDATOR_INIT_DEPOSIT(),
            "PoolValidators: invalid operator collateral"
        );

        // check whether provided deposit data was previously approved
        bytes32 node = keccak256(abi.encode(
            depositData.publicKey,
            depositData.withdrawalCredentials,
            depositData.signature,
            depositData.depositDataRoot
        ));
        require(
            MerkleProofUpgradeable.verify(merkleProof, initializeMerkleRoot, node),
            "PoolValidators: invalid merkle proof"
        );

        // lock operator -> prevents from initializing multiple validators
        // for the same operator without finalizing them
        require(!locked, "PoolValidators: operator already locked");
        operator.locked = true;

        // initialize validator
        pool.initializeValidator(depositData);
    }

    /**
     * @dev See {IPoolValidators-finalizeValidator}.
     */
    function finalizeValidator(DepositData memory depositData, bytes32[] memory merkleProof) external override whenNotPaused {
        require(msg.sender == oracles, "PoolValidators: access denied");

        // mark validator as finalized -> prevents from finalizing the same validator twice
        bytes32 validatorId = keccak256(abi.encode(depositData.publicKey));
        require(
            validatorStatuses[validatorId] == ValidatorStatus.Initialized,
            "PoolValidators: invalid validator status"
        );
        validatorStatuses[validatorId] = ValidatorStatus.Finalized;

        // fetch operator
        Operator storage operator = operators[depositData.operator];
        (bytes32 finalizeMerkleRoot, bool locked) = (operator.finalizeMerkleRoot, operator.locked);
        require(finalizeMerkleRoot != "", "PoolValidators: invalid operator");

        // check whether provided deposit data was previously approved
        bytes32 node = keccak256(abi.encode(
            depositData.publicKey,
            depositData.withdrawalCredentials,
            depositData.signature,
            depositData.depositDataRoot
        ));
        require(
            MerkleProofUpgradeable.verify(merkleProof, finalizeMerkleRoot, node),
            "PoolValidators: invalid merkle proof"
        );

        // unlock operator to be able to receive further validators
        require(locked, "PoolValidators: operator not locked");
        operator.locked = false;

        // finalize validator
        pool.finalizeValidator(depositData);
    }
}
