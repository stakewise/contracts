// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/**
 * @dev ABIEncoderV2 is used to enable encoding/decoding of the array of structs. The pragma
 * is required, but ABIEncoderV2 is no longer considered experimental as of Solidity 0.6.0
 */

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IManagers.sol";
import "./interfaces/ISettings.sol";
import "./interfaces/IPayments.sol";

/**
 * @title Payments
 *
 * @dev Payments contract is used for billing non-custodial validators.
 */
contract Payments is IPayments, Initializable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // @dev Maps account address to its selected token contract address.
    mapping(address => address) public override selectedTokens;

    // @dev Maps account address to its token balance.
    mapping(address => uint256) private balances;

    // @dev Address of the Settings contract.
    ISettings private settings;

    // @dev Address of the Managers contract.
    IManagers private managers;

    /**
     * @dev See {IPayments-initialize}.
     */
    function initialize(address _settings, address _managers) public override initializer {
        settings = ISettings(_settings);
        managers = IManagers(_managers);
    }

    /**
     * @dev See {IPayments-balanceOf}.
     */
    function balanceOf(address _account) external view override returns (uint256) {
        return balances[_account];
    }

    /**
     * @dev See {IPayments-addTokens}.
     */
    function addTokens(address _token, uint256 _amount) external override {
        require(!settings.pausedContracts(address(this)), "Payments: contract is paused");
        require(settings.supportedPaymentTokens(_token), "Payments: token is not supported");

        // setup new selected token
        address selectedToken = selectedTokens[msg.sender];
        if (selectedToken != _token) {
            // withdraw previously used tokens
            if (balances[msg.sender] > 0) {
                withdrawTokens(balances[msg.sender]);
            }
            selectedTokens[msg.sender] = _token;
        }

        // update account's balance
        balances[msg.sender] = balances[msg.sender].add(_amount);
        emit BalanceUpdated(_token, msg.sender);

        // transfer tokens to this contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev See {IPayments-withdrawTokens}.
     */
    function withdrawTokens(uint256 _amount) public override {
        require(_amount > 0, "Payments: invalid amount");

        // update account's balance
        balances[msg.sender] = balances[msg.sender].sub(_amount, "Payments: insufficient tokens balance");

        address selectedToken = selectedTokens[msg.sender];
        emit BalanceUpdated(selectedToken, msg.sender);

        // transfer tokens to account
        IERC20(selectedToken).safeTransfer(msg.sender, _amount);
    }

    /**
     * @dev See {IPayments-executePayments}.
     */
    function executePayments(Payment[] calldata _payments) external override {
        require(managers.isManager(msg.sender), "Payments: permission denied");

        address maintainer = settings.maintainer();
        for (uint256 i = 0; i < _payments.length; i++) {
            Payment calldata p = _payments[i];
            balances[p.sender] = balances[p.sender].sub(p.amount, "Payments: insufficient balance");

            // emit event
            address token = selectedTokens[p.sender];
            emit PaymentSent(p.billDate, token, p.sender, maintainer, p.amount);

            // execute payment
            IERC20(token).safeTransfer(maintainer, p.amount);
        }
    }
}
