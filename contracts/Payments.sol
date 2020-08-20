// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IOperators.sol";
import "./interfaces/IManagers.sol";
import "./interfaces/ISettings.sol";
import "./interfaces/IPayments.sol";

/**
 * @title Payments
 *
 * @dev Payments contract is used for billing non-custodial validators.
 */
contract Payments is IPayments {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // @dev Indicates that the contract has been initialized.
    bool private initialized;

    // @dev Address of the Operators contract.
    IOperators private operators;

    // @dev Address of the Managers contract.
    IManagers private managers;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the DAI contract.
    IERC20 private dai;

    // @dev Address of the contract owner (creator).
    address private owner;

    // @dev Address of the tokens refund recipient.
    address private refundRecipient;

    // @dev Last metering timestamp.
    uint256 private lastMeteringTimestamp;

    // @dev Total price of all the validators.
    uint256 private totalPrice;

    // @dev Total bill for all the validators.
    uint256 private totalBill;

    // @dev Maps validator ID (hash of the public key) to its price.
    mapping(bytes32 => uint256) private validatorPrices;

    /**
     * @dev See {IPayments-initialize}.
     */
    function initialize(
        IOperators _operators,
        IManagers _managers,
        ISettings _settings,
        address _dai,
        address _owner
    )
        public override
    {
        initialized = true;
        operators = _operators;
        managers = _managers;
        settings = _settings;
        dai = IERC20(_dai);
        owner = _owner;
    }

    /**
     * @dev See {IPayments-setRefundRecipient}.
     */
    function setRefundRecipient(address _refundRecipient) external override {
        require(msg.sender == owner, "Permission denied.");
        refundRecipient = _refundRecipient;
    }

    /**
     * @dev See {IPayments-startMeteringValidator}.
     */
    function startMeteringValidator(bytes32 _validatorId) external override {
        require(msg.sender == owner, "Permission denied.");

        // update validators total bill until current timestamp
        // solhint-disable-next-line not-rely-on-time
        totalBill = getTotalBill(block.timestamp);

        // update last metering timestamp
        // solhint-disable-next-line not-rely-on-time
        lastMeteringTimestamp = block.timestamp;

        // start metering new set of validators with the updated price
        uint256 validatorPrice = settings.validatorPrice();
        validatorPrices[_validatorId] = validatorPrice;
        totalPrice = totalPrice.add(validatorPrice);
    }

    /**
     * @dev See {IPayments-stopMeteringValidator}.
     */
    function stopMeteringValidator(bytes32 _validatorId) external override {
        require(operators.isOperator(msg.sender), "Permission denied.");
        require(validatorPrices[_validatorId] != 0, "Metering is already stopped for the validator.");

        // update validators total bill until current timestamp
        // solhint-disable-next-line not-rely-on-time
        totalBill = getTotalBill(block.timestamp);

        // update last metering timestamp
        // solhint-disable-next-line not-rely-on-time
        lastMeteringTimestamp = block.timestamp;

        // start metering validators with the updated price
        totalPrice = totalPrice.sub(validatorPrices[_validatorId]);
        delete validatorPrices[_validatorId];
    }

    /**
     * @dev See {IPayments-getTotalBill}.
     */
    function getTotalBill(uint256 _timestamp) public override view returns (uint256) {
        if (lastMeteringTimestamp != 0) {
            uint256 duration = _timestamp.sub(lastMeteringTimestamp);
            if (duration > 0) {
                return totalBill.add(totalPrice.mul(duration));
            }
        }

        return totalBill;
    }

    /**
     * @dev See {IPayments-getTotalPrice}.
     */
    function getTotalPrice() external override view returns (uint256) {
        return totalPrice;
    }

    /**
     * @dev See {IPayments-withdraw}.
     */
    function withdraw(uint256 _amount) external override {
        require(managers.isManager(msg.sender), "Permission denied.");

        // update validators total bill until current timestamp
        // solhint-disable-next-line not-rely-on-time
        totalBill = getTotalBill(block.timestamp);

        // update last metering timestamp
        // solhint-disable-next-line not-rely-on-time
        lastMeteringTimestamp = block.timestamp;

        // deduct withdrawn amount from the total bill
        totalBill = totalBill.sub(_amount);

        // transfer payment to the maintainer
        dai.safeTransfer(settings.maintainer(), _amount);
    }

    /**
     * @dev See {IPayments-refund}.
     */
    function refund(uint256 _amount) external override {
        require(msg.sender == refundRecipient, "Permission denied.");

        // update validators total bill until current timestamp
        // solhint-disable-next-line not-rely-on-time
        totalBill = getTotalBill(block.timestamp);

        // check whether contract has enough tokens balance
        require(dai.balanceOf(address(this)).sub(totalBill) >= _amount, "Insufficient balance.");

        // update last metering timestamp
        // solhint-disable-next-line not-rely-on-time
        lastMeteringTimestamp = block.timestamp;

        dai.safeTransfer(refundRecipient, _amount);
    }
}
