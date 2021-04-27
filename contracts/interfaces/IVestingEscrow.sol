// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.7.5;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of the VestingEscrow contract.
 */
interface IVestingEscrow {
    /**
    * @dev Event for tracking escrow stoppage.
    * @param sender - address of the transaction sender.
    * @param beneficiary - address of the beneficiary where all the vested tokens were transferred.
    * @param amount - amount of vested tokens pulled.
    */
    event Stopped(address indexed sender, address indexed beneficiary, uint256 amount);

    /**
    * @dev Event for tracking escrow claims.
    * @param sender - address of the transaction sender.
    * @param beneficiary - address of the beneficiary where the tokens were transferred.
    * @param amount - amount of unvested tokens claimed.
    */
    event Claimed(address indexed sender, address indexed beneficiary, uint256 amount);

    /**
    * @dev Constructor for initializing the VestingEscrow contract.
    * @param _admin - address of the contract admin.
    * @param _token - address of the token.
    * @param _recipient - address of the recipient of the tokens.
    * @param _beneficiary - address of the tokens beneficiary.
    * @param _totalAmount - amount of tokens to vest.
    * @param _startTime - start timestamp of the vesting in seconds.
    * @param _endTime - end timestamp of the vesting in seconds.
    * @param _cliffLength - cliff length in seconds.
    */
    function initialize(
        address _admin,
        address _token,
        address _recipient,
        address _beneficiary,
        uint256 _totalAmount,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _cliffLength
    ) external;

    /**
    * @dev Function for fetching the total vested tokens amount.
    */
    function vestedAmount() external view returns (uint256);

    /**
    * @dev Function for fetching the total unclaimed tokens amount.
    */
    function unclaimedAmount() external view returns (uint256);

    /**
    * @dev Function for fetching the token contract address.
    */
    function token() external view returns (IERC20);

    /**
    * @dev Function for fetching the recipient address.
    */
    function recipient() external view returns (address);

    /**
    * @dev Function for fetching the beneficiary address.
    */
    function beneficiary() external view returns (address);

    /**
    * @dev Function for fetching the total vested amount.
    */
    function totalAmount() external view returns (uint256);

    /**
    * @dev Function for fetching the total claimed amount.
    */
    function claimedAmount() external view returns (uint256);

    /**
    * @dev Function for fetching vesting start time.
    */
    function startTime() external view returns (uint256);

    /**
    * @dev Function for fetching vesting end time.
    */
    function endTime() external view returns (uint256);

    /**
    * @dev Function for fetching vesting cliff length.
    */
    function cliffLength() external view returns (uint256);

    /**
    * @dev Function for stopping the vesting contract.
    * Can be called only by admin. The unvested tokens will be transferred to the `_beneficiary` address.
    * @param _beneficiary - address of the unvested tokens recipient.
    */
    function stop(address _beneficiary) external;

    /**
    * @dev Function for claiming the vested tokens.
    * Can be called only by the tokens recipient. The amount claimed must be vested by the time of calling.
    * @param amount - amount of tokens to claim.
    */
    function claim(uint256 amount) external;
}
